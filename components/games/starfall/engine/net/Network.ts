// STUB — replaced by the multiplayer engineer.
import type { Ctx, GestureName, INetwork, NetPeer, NetStatus, RoomInfo } from '../types'

export class Network implements INetwork {
  status: NetStatus = 'offline'
  room: RoomInfo | null = null
  readonly selfId = ''
  readonly peers = new Map<string, NetPeer>()
  profile = { name: 'Player', color: '#c9432f' }
  constructor(private ctx: Ctx) {}
  init(): void {}
  update(): void {}
  setProfile(p: Partial<{ name: string; color: string }>): void { this.profile = { ...this.profile, ...p } }
  listPublicRooms(): Promise<RoomInfo[]> { return Promise.resolve([]) }
  join(): Promise<void> { return Promise.reject(new Error('Online play is not available yet')) }
  quickJoin(): Promise<void> { return this.join() }
  createPrivate(): Promise<string> { return Promise.reject(new Error('Online play is not available yet')) }
  leave(): Promise<void> { return Promise.resolve() }
  sendChat(): void {}
  sendEmote(_n: GestureName): void {}
  dispose(): void {}
}
