import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatRoom } from './chat.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { MeController } from './controllers/me.controller';
import { IdController } from './controllers/id.controller';
import { MutedUser } from './mute.entity';
import { BannedUser } from './banned.entity';
import { Log } from './log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatRoom, MutedUser, BannedUser, Log]), AuthModule],
  providers: [ChatGateway, ChatService],
  exports: [ChatService],
  controllers: [MeController, IdController],
})
export class ChatModule {}
