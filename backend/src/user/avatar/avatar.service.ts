import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Avatar } from './avatar.entity';

@Injectable()
export class AvatarService {
  constructor(
    @InjectRepository(Avatar)
    private repo: Repository<Avatar>,
  ) {}

  async setAvatar(
    id: number,
    name: string,
    dataBuffer: Buffer,
  ): Promise<Avatar> {
    const currentavatar = await this.repo.findOne(id);
    currentavatar.data = dataBuffer;
    currentavatar.filename = name;
    this.repo.save(currentavatar);
    return currentavatar;
  }

  async createAvatar(
    id: number,
    name: string,
    dataBuffer: Buffer,
  ): Promise<Avatar> {
    const currentavatar = this.repo.create({
      id,
      filename: name,
      data: dataBuffer,
    });
    await this.repo.save(currentavatar);
    return currentavatar;
  }

  async getAvatarById(id: number): Promise<Avatar> {
    const avatar: Avatar = await this.repo.findOne(id);
    if (!avatar)
      throw new HttpException('Avatar not found', HttpStatus.NOT_FOUND);
    return avatar;
  }
}

export default AvatarService;
