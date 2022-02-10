import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../infrastructure/user.entity';


@Injectable()
export class UserService {
    constructor(@InjectRepository(User) private readonly repo: Repository<User>){}
    private lastUserId = 0;

    

    async getAllUsers()
    {
        return await this.repo.find();
    }

    async getUserById(id: number)
    {
        const user = await this.repo.findOne(id);    
        console.log(user);
        if (user){
            return user;
        }
        else
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    async createUser(user: User)
    {
        const newUser = {
            id: ++(this.lastUserId),
            ...user
        }
        await this.repo.save(newUser);
        return user;
    }

    async deleteUser(id: number)
    {
        const firstUser = await this.repo.findOne(1);
        if (firstUser)
        {
            await this.repo.remove(firstUser);
        }
        else
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
}