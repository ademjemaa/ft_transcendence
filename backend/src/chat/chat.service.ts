import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ChatRoom } from './chat.entity';
import { MutedUser } from './mute.entity';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/user.entity';
import { PasswordI } from './interfaces/password.interface';
import { BannedUser } from './banned.entity';
import { Log } from './log.entity';
import * as bcrypt from 'bcrypt';
import { func, string } from 'joi';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly chatRepo: Repository<ChatRoom>,
    @InjectRepository(MutedUser)
    private readonly mutedRepo: Repository<MutedUser>,
    @InjectRepository(BannedUser)
    private readonly bannedRepo: Repository<BannedUser>,
    @InjectRepository(Log)
    private readonly logRepo: Repository<Log>,
  ) {}

  async getRoomById(id: number): Promise<ChatRoom> {
    const chat = await this.chatRepo.findOne(id);

    if (!chat) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    delete chat.password;
    return chat;
  }

  async createRoom(room: ChatRoom, admin: User) {
    if (room.name == undefined)
      throw new HttpException('Room name needs to be specified', HttpStatus.BAD_REQUEST);
    let hashedPassword = '';
    if (room.public == false)
    {
      if (room.password)
        hashedPassword = await bcrypt.hash(String(room.password), 10);
      else
        throw new HttpException('Password Required', HttpStatus.BAD_REQUEST);
    }
    const currentRoom = this.chatRepo.create({
      name: room.name,
      adminId: [],
      public: room.public,
      ownerId: admin.id,
      users: [admin],
      muted: [],
      password: hashedPassword,
    });
    currentRoom.adminId.push(admin.id);
    try {
      await this.chatRepo.save(currentRoom);
    } catch (error) {
      return;
    }
    currentRoom.password = undefined;
    return currentRoom;
  }

  async deleteRoom(id: number) {
    const roomid = await this.getRoomInfo(id);
    if (roomid) {
      roomid.muted.forEach(muted => {
        this.mutedRepo.remove(muted);
      })
      roomid.banned.forEach(banned => {
        this.bannedRepo.remove(banned);
      })
      roomid.logs.forEach(log => {
        this.logRepo.remove(log);
      })
      await this.chatRepo.remove(roomid);

    } else throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
  }

  async getRoomInfo(roomId: number) {
    const room = await this.chatRepo.findOne(roomId, { relations: ['users', 'muted', 'banned', 'logs'] });
    if (!room)
      throw new HttpException("Room not found", HttpStatus.NOT_FOUND);
    room.password = undefined;
    return room;
  }

  async removeUserFromRoom(user: User, roomId: number, adminId: number) {
    const room = await this.chatRepo.findOne(roomId, { relations: ['users'] });
    var index = room.adminId.indexOf(adminId);
    if (index == -1)
      throw new HttpException(
        'User isnt admin in room',
        HttpStatus.UNAUTHORIZED,
      );
    if (room) {
      if (user.id == room.ownerId && adminId == room.ownerId)
      {
        this.deleteRoom(room.id);
        return ;
      }
      if (room.adminId.indexOf(user.id) != -1)
        room.adminId.splice(room.adminId.indexOf(user.id));
      var index = room.users.map((user) => user.id).indexOf(user.id);
      if (index !== -1) room.users.splice(index, 1);
      else throw new HttpException('User not in room', HttpStatus.NOT_FOUND);
      await this.chatRepo.save(room);
    } else throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
  }

  async changePassword(pass: PasswordI, room: ChatRoom) {
    if (pass.newPassword == '')
      throw new HttpException(
        'New password cannot be empty',
        HttpStatus.BAD_REQUEST,
      );
    if (await this.checkPassword(room.id, pass.oldPassword)) 
    {
      const hashedPassword = await bcrypt.hash(pass.newPassword, 10);
      room.password = hashedPassword;
      this.chatRepo.save(room);
    } else
      throw new HttpException(
        'Wrong credentials provided',
        HttpStatus.BAD_REQUEST,
      );
  }

  async checkPassword(id: number, password: string) {
    const currentRoom = await this.chatRepo.findOne(id);
    if (password)
      if (await bcrypt.compare(password, currentRoom.password)) return true;
    return false;
  }

  async updateRoom(id: number, room: ChatRoom, user: User) {
    let updatedRoom = await this.chatRepo.findOne(id);
    if (!updatedRoom)
      throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
    if (updatedRoom.ownerId !== user.id)
      throw new HttpException('User isnt owner of Room', HttpStatus.FORBIDDEN);
    room.password = undefined;
    const currentRoom = this.chatRepo.create({
      id: updatedRoom.id,
      name: (room.name ? room.name : updatedRoom.name),
      password: updatedRoom.password,
      public: (room.public != undefined ? room.public : updatedRoom.public),
      adminId: updatedRoom.adminId,
      ownerId: updatedRoom.ownerId,
    });
    if (updatedRoom) {
      return await this.chatRepo.update({ id: currentRoom.id }, currentRoom);
    }
  }

  async getAllRooms() {
    const rooms = await this.chatRepo.find();
    rooms.forEach((chat) => {
      chat.password = undefined;
    });
    return rooms;
  }

  async getRoomsForUser(userId: number) {
    let rooms : ChatRoom[] = []
    const query = await this.chatRepo
      .createQueryBuilder('room')
      .leftJoin('room.users', 'user')
      .where('user.id = :userId', { userId })
      .leftJoinAndSelect('room.users', 'all_users')
      .getMany();
    for (const room of query)
    {
      const currentRoom = await this.getRoomInfo(room.id);
      rooms.push(currentRoom);
    }
    return rooms;
  }

  async getUsersForRoom(roomId: number) {
    const chatroom = await this.chatRepo.findOne(roomId);
    if (chatroom) {
      const query = await this.chatRepo
        .createQueryBuilder('room')
        .leftJoin('room.users', 'user')
        .where('room.id = :roomId', { roomId })
        .leftJoinAndSelect('room.users', 'all_rooms')
        .getMany();
      query.forEach((chat) => {
        chat.password = undefined;
      });
      return query;
    } else throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
  }

  async addUserToRoom(room: ChatRoom, user: User) {
    const curroom = await this.chatRepo.findOne(room.id, { relations: ['users', 'banned'] });
    if (!curroom)
      throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
    const page = await this.getUsersForRoom(room.id);

    if (!curroom.public)
      if ((room.password == undefined) || !(await bcrypt.compare(room.password, curroom.password)))
        throw new HttpException('Incorrect password', HttpStatus.FORBIDDEN); 
    curroom.banned.forEach(banned => {
      if (banned.userId == user.id)
      {
        let time = new Date();
        if (banned.endOfBan < time)
          this.UnBanUserInRoom(banned, curroom);
        else
          throw new HttpException('User is banned from Room', HttpStatus.FORBIDDEN);
      }
    })
    let userexists = false;
    curroom.users.forEach((curuser) => {
      if (curuser.id == user.id) userexists = true;
    });
    if (!userexists)
      page.forEach(async (id) => {
        await this.chatRepo
          .createQueryBuilder()
          .relation(ChatRoom, 'users')
          .of(curroom)
          .add(user);
      });
  }

  async UserAdminRole(owner: User, newAdmin: User, roomid: number)
  {
    const room = await this.getRoomInfo(roomid);

    if (room.ownerId == owner.id)
    {
      var index = room.users.map((user) => user.id).indexOf(newAdmin.id);
      if (newAdmin.id === room.ownerId)
        throw new HttpException('Owner canno\'t be demoted', HttpStatus.FORBIDDEN);
      if (index === -1)
        throw new HttpException('User getting promoted isn\'t part of the room', HttpStatus.FORBIDDEN);
      else
      {
        index = room.adminId.indexOf(newAdmin.id);
        if (index === -1)
          room.adminId.push(newAdmin.id);
        else
          room.adminId.splice(index, 1);
        await this.chatRepo.save(room);
      }
    }
    else
      throw new HttpException('User isn\'t the room\'s owner', HttpStatus.FORBIDDEN);
  }

  async UnBanUserInRoom(user: BannedUser, room: ChatRoom)
  {
    var index = room.banned.map((user) => user.id).indexOf(user.id);
      if (index !== -1) room.banned.splice(index, 1);
    await this.chatRepo.save(room);
    this.bannedRepo.delete(user);
  }

  async UnMuteUserInRoom(user: MutedUser, room: ChatRoom)
  {
    var index = room.muted.map((user) => user.id).indexOf(user.id);
      if (index !== -1) room.muted.splice(index, 1);
    await this.chatRepo.save(room);
    this.mutedRepo.delete(user);
  }

  async MuteUserInRoom(user: User, roomid: number, admin: User)
  {
    let time = new Date();
    time = new Date(time.getTime() + (30 * 60 * 1000))
    const currentroom = await this.chatRepo.findOne(roomid, {relations : ['users', 'muted']});
    if (!currentroom)
      throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
    if (currentroom.ownerId == user.id)
      throw new HttpException('User is owner and thus cannot be muted', HttpStatus.FORBIDDEN);
    if (currentroom.users.map((user) => user.id).indexOf(user.id) == -1)
      throw new HttpException(
        'User isnt in room',
        HttpStatus.NOT_FOUND,
      );
    var index = currentroom.adminId.indexOf(admin.id);
    if (index == -1)
      throw new HttpException(
        'User isnt admin in room',
        HttpStatus.UNAUTHORIZED,
      );
    const muted = this.mutedRepo.create({
      userId: user.id,
      endOfMute: time,
      room: currentroom.id,
    });
    this.mutedRepo.save(muted);
    currentroom.muted.push(muted);
    return await this.chatRepo.save(currentroom);
  }

  async BanUserInRoom(user: User, roomid: number, admin: User)
  {
    let time = new Date();
    time = new Date(time.getTime() + (30 * 60 * 1000))
    const currentroom = await this.chatRepo.findOne(roomid, {relations : ['users','banned']});
    if (!currentroom)
      throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
    if (currentroom.ownerId == user.id)
      throw new HttpException('User is owner and thus cannot be banned', HttpStatus.FORBIDDEN);
    if (currentroom.users.map((user) => user.id).indexOf(user.id) == -1)
      throw new HttpException(
        'User isnt in room',
        HttpStatus.NOT_FOUND,
      );
    var index = currentroom.adminId.indexOf(admin.id);
    if (index == -1)
      throw new HttpException(
        'User isnt admin in room',
        HttpStatus.UNAUTHORIZED,
      );
    const banned = this.bannedRepo.create({
      userId: user.id,
      endOfBan: time,
      room: currentroom.id,
    });
    var index = currentroom.users.map((user) => user.id).indexOf(user.id);
      if (index !== -1) currentroom.users.splice(index, 1);
    this.bannedRepo.save(banned);
    currentroom.banned.push(banned);
    return await this.chatRepo.save(currentroom);
  }

  async addLogForRoom(id: number, message: string, user: User)
  {
    const currentroom = await this.chatRepo.findOne(id, {relations : ['users', 'logs', 'muted']});
    if (!currentroom)
      throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
    if (currentroom.users.map((user) => user.id).indexOf(user.id) === -1)
      throw new HttpException(
        'User isnt in room',
        HttpStatus.NOT_FOUND,
      );
      currentroom.muted.forEach(muted => {
        if (muted.userId == user.id)
        {
          let time = new Date();
          if (muted.endOfMute < time)
            this.UnMuteUserInRoom(muted, currentroom);
          else
            throw new HttpException('User is muted from Room', HttpStatus.FORBIDDEN);
        }
      })
    const log = this.logRepo.create({
        message: message,
        time: new Date(),
        room: currentroom.id,
        user: user,
      });
      this.logRepo.save(log);
      if (currentroom.logs.length > 100)
      {
        this.logRepo.delete(currentroom.logs[0]);
        currentroom.logs.shift();
      }
      currentroom.logs.push(log);
      return await this.chatRepo.save(currentroom);
  }

  async getLogsForRoom(id: number, user: User)
  {
    const currentroom = await this.chatRepo.findOne(id, {relations : ['logs']});
    if (!currentroom)
      throw new HttpException('Room not found', HttpStatus.NOT_FOUND); 
    let logs = [];
    for (const log of currentroom.logs)
    {
      const currelog = await this.logRepo.findOne(log.id, { relations : ['user']});
      if (user.blocked.indexOf(currelog.user.id) == -1)
         logs.push(currelog);
    }
    return logs;
  }
}
