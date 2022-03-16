import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from 'src/user/user.entity';

@Entity()
export class Match {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  public score: String;

  @Column({ type: 'timestamptz' })
  public date: Date;

  @ManyToOne(() => User)
  @JoinColumn()
  winner: User;

  @ManyToOne(() => User)
  @JoinColumn()
  loser: User;

}