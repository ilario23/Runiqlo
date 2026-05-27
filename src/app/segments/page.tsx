import {redirect} from 'next/navigation';

export default function SegmentsPage() {
  redirect('/activities?tab=segments');
}
