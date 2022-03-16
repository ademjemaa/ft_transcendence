import { ConsoleLogger } from '@nestjs/common';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { User } from 'src/user/user.entity';
import { UserService } from 'src/user/user.service';
import { ChatService } from './chat.service';
import { ChatRoom } from './entity/chat.entity';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONT_URL,
  },
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly chatService: ChatService,
  ) {}
  @WebSocketServer()
  server: any;

  async handleConnection(client: Socket) {
    if (!client.handshake.headers.authorization) return client.disconnect();
    const payload = this.authService.verify(
      client.handshake.headers.authorization.split(' ')[1],
    );
    const user: User = await this.userService
      .getUserById(payload.sub)
      .catch(() => null);
    if (!user) client.disconnect();

    client.data.user = user;
    client.emit('info', {
      user,
      channels: await this.chatService.getRoomsForUser(user.id),
    });
  }

  emitRoom(room: ChatRoom, event: string, ...args) {
    if (!room.users) return;

    const sockets: any[] = Array.from(this.server.sockets.values());
    sockets.forEach((socket) => {
      if (room.users.find((user) => user.id == socket.data.user.id))
        socket.emit(event, ...args);
    });
  }

  @SubscribeMessage('channel')
  async getChannel(client: Socket, id: number) {
    const channel = await this.chatService.getRoom(id, ['users', 'logs']);
    client.emit('channel', channel);
  }

  @SubscribeMessage('text')
  async handleMessage(client: Socket, data: any) {
    const room = await this.chatService.getRoom(data.id, ['users']);

    const user = client.data.user;

    this.chatService.addLogForRoom(data.id, data.value, user);
    this.emitRoom(room, 'text', {
      user: { id: user.id, username: user.username },
      ...data,
    });
  }

  @SubscribeMessage('join')
  async joinChannel(client: Socket, id: number) {
    const room = await this.chatService.getRoom(id, ['users']);
    //console.log(room);
  }

  @SubscribeMessage('leave')
  async leaveChannel(client: Socket, roomId: number, adminId?: number) {
    const room = await this.chatService.getRoom(roomId, []);
  }

  @SubscribeMessage('admin')
  async toggleAdmin(client: Socket, data: any) {
    try
    {
      const room = await this.chatService.getRoom(data.roomId, ['users']);
      const owner = client.data.user;
      const admin = await this.userService.getUserById(data.userId);
      let is_admin = false;

      this.chatService.toggleAdminRole(owner, admin, room.id);
      
      if (room.adminId.indexOf(admin.id) != -1)
        is_admin = true;
      this.emitRoom(room, 'admin', {
        user: { id: admin.id, username: admin.username },
        is_admin: is_admin,
      });
    }
    catch (error)
    {
      console.error(error);
      return;
    }
  }

  @SubscribeMessage('mute')
  async toggleMute(client: Socket, data: any) {
    try
    {
      const room = await this.chatService.getRoom(data.roomId, ['users', 'muted']);
      const curuser = await this.userService.getUserById(data.userId)
      const admin = client.data.user;
      let is_muted = false;

      const muted = room.muted.find(muted => muted.userId == data.userId);

      if (muted)
        this.chatService.unMuteUserInRoom(muted, room);
      else
      {
        this.chatService.muteUserInRoom(curuser, room.id, admin);
        is_muted = true;
      }
      this.emitRoom(room, 'mute', {
        user: { id: admin.id, username: admin.username },
        is_muted: is_muted,
      });
    }
    catch (error)
    {
      console.error(error);
      return;
    }
  }

  @SubscribeMessage('ban')
  async toggleBan(client: Socket, data: any) {
    try
    {
      const room = await this.chatService.getRoom(data.roomId, ['users', 'banned']);
      const curuser = await this.userService.getUserById(data.userId)
      const admin = client.data.user;
      let is_banned = false;

      const banned = room.banned.find(banned => banned.userId == banned.userId);

      if (banned)
        this.chatService.unBanUserInRoom(banned, room);
      else
      {
        this.chatService.banUserInRoom(curuser, room.id, admin);
        is_banned = true;
      }
      this.emitRoom(room, 'ban', {
        user: { id: admin.id, username: admin.username },
        is_banned: is_banned,
      });
    }
    catch (error)
    {
      console.error(error);
      return;
    }
  }
}
