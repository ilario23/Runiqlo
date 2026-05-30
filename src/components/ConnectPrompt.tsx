'use client';

import Image from 'next/image';
import Link from 'next/link';
import {motion} from 'framer-motion';

interface ConnectPromptProps {
  subtitle?: string;
}

export function ConnectPrompt({subtitle = 'Link your account to start syncing training data'}: ConnectPromptProps) {
  return (
    <div className='flex min-h-screen items-center justify-center p-6'>
      <motion.div
        initial={{opacity: 0, scale: 0.96}}
        animate={{opacity: 1, scale: 1}}
        transition={{duration: 0.4}}
        className='surface-card p-10 max-w-sm w-full text-center space-y-5'
      >
        <div className='w-14 h-14 flex items-center justify-center mx-auto'>
          <Image src='/logo.png' alt='Runiqlo' width={56} height={56} />
        </div>
        <div>
          <h2 className='text-lg font-semibold text-white'>Connect Strava</h2>
          <p className='text-sm mt-1' style={{color: 'var(--color-text-2)'}}>{subtitle}</p>
        </div>
        <Link
          href='/settings'
          className='block w-full bg-brand hover:bg-brand/90 text-white font-semibold py-3 rounded-xl text-sm transition-colors'
        >
          Go to Settings
        </Link>
      </motion.div>
    </div>
  );
}
