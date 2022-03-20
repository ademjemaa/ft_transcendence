import {
  HttpException,
  HttpStatus,
  Injectable,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Readable } from 'stream';
import { Repository } from 'typeorm';
import { Avatar } from '../entities/avatar.entity';

@Injectable()
export class AvatarService {
  constructor(
    @InjectRepository(Avatar)
    private avatarRepository: Repository<Avatar>,
  ) {}

  async createAvatar(filename: string, data: Buffer): Promise<Avatar> {
    const avatar = this.avatarRepository.create({ filename, data });

    try {
      await this.avatarRepository.save(avatar);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
    return avatar;
  }

  async deleteAvatar(avatarId: number): Promise<void> {
    try {
      await this.avatarRepository.delete(avatarId);
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  toStreamableFile(data: Buffer): StreamableFile {
    return new StreamableFile(Readable.from(data));
  }
}

export default AvatarService;