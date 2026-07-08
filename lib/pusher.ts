import Pusher from 'pusher'

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '2174716',
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || '7e1bccd74cc3954ced0d',
  secret: process.env.PUSHER_SECRET || '7e5bd6f5df09ca146c32',
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'eu',
  useTLS: true,
})

export async function triggerPusher(channel: string, event: string, data: any) {
  try {
    await pusher.trigger(channel, event, data)
  } catch (err) {
    console.error('Pusher trigger failed:', err)
  }
}
