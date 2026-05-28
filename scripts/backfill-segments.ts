/**
 * One-time backfill: reads all cached activity_details rows and populates
 * the segment_efforts table. Safe to re-run (upserts on effort ID).
 *
 * Usage:
 *   npx tsx scripts/backfill-segments.ts
 */

import {config} from 'dotenv';
config({path: '.env.local'});

import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {sql} from 'drizzle-orm';
import * as schema from '../src/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL not set in .env.local');

const client = postgres(DATABASE_URL, {prepare: false});
const db = drizzle(client, {schema});

const BATCH_SIZE = 100; // efforts per INSERT

interface RawEffort {
  id: number;
  elapsed_time: number;
  moving_time: number;
  start_date_local: string;
  distance: number;
  average_heartrate?: number;
  pr_rank: number | null;
  segment: {
    id: number;
    name: string;
    distance: number;
    average_grade: number;
    maximum_grade: number;
    elevation_high: number;
    elevation_low: number;
    city: string;
    state: string;
    climb_category: number;
    starred: boolean;
  };
}

async function main() {
  console.log('Reading activity_details…');
  const rows = await db.select().from(schema.activityDetails);
  console.log(`Found ${rows.length} activity details`);

  const allEfforts: (typeof schema.segmentEfforts.$inferInsert)[] = [];

  for (const row of rows) {
    const data = row.data as {segment_efforts?: RawEffort[]};
    const efforts = data.segment_efforts ?? [];
    const syncedAt = row.fetchedAt;

    for (const e of efforts) {
      if (!e.segment) continue;
      allEfforts.push({
        id: e.id,
        athleteId: row.athleteId,
        activityId: row.id,
        segmentId: e.segment.id,
        segmentName: e.segment.name,
        elapsedTime: e.elapsed_time,
        movingTime: e.moving_time,
        startDateLocal: e.start_date_local,
        distance: e.distance,
        averageHeartrate: e.average_heartrate ?? null,
        prRank: e.pr_rank ?? null,
        segmentDistance: e.segment.distance,
        averageGrade: e.segment.average_grade,
        maximumGrade: e.segment.maximum_grade,
        elevationHigh: e.segment.elevation_high,
        elevationLow: e.segment.elevation_low,
        city: e.segment.city ?? '',
        state: e.segment.state ?? '',
        climbCategory: e.segment.climb_category ?? 0,
        starred: e.segment.starred ?? false,
        syncedAt,
      });
    }
  }

  // Deduplicate by id — large Strava bigints lose precision as JS numbers,
  // so two different effort IDs can round to the same value.
  const dedupMap = new Map<number, typeof allEfforts[0]>();
  for (const e of allEfforts) dedupMap.set(e.id as number, e);
  const deduped = Array.from(dedupMap.values());
  if (deduped.length < allEfforts.length) {
    console.log(`Deduplicated ${allEfforts.length - deduped.length} collisions → ${deduped.length} unique efforts`);
  }
  allEfforts.length = 0;
  allEfforts.push(...deduped);

  console.log(`Extracted ${allEfforts.length} segment efforts`);
  if (allEfforts.length === 0) {
    console.log('Nothing to insert.');
    await client.end();
    return;
  }

  let inserted = 0;
  for (let i = 0; i < allEfforts.length; i += BATCH_SIZE) {
    const batch = allEfforts.slice(i, i + BATCH_SIZE);
    try {
      await db
        .insert(schema.segmentEfforts)
        .values(batch)
        .onConflictDoUpdate({
          target: schema.segmentEfforts.id,
          set: {
            elapsedTime: sql`excluded.elapsed_time`,
            movingTime: sql`excluded.moving_time`,
            prRank: sql`excluded.pr_rank`,
            starred: sql`excluded.starred`,
            syncedAt: sql`excluded.synced_at`,
          },
        });
    } catch (err: unknown) {
      const cause = (err as {cause?: {message?: string}})?.cause;
      console.error(`\nBatch ${i}–${i + batch.length} failed:`, cause?.message ?? err);
      continue;
    }
    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${allEfforts.length}`);
  }

  console.log('\nDone.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
