import { getSpots } from '@/app/actions/spots'
import MapApp from '@/components/map-app'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const spots = await getSpots()
  return <MapApp initialSpots={spots} />
}
