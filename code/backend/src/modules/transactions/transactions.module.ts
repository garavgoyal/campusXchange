import { Module } from '@nestjs/common';
import { DisputesService } from './disputes.service.js';
import { AdminDisputesController, TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  controllers: [TransactionsController, AdminDisputesController],
  providers: [TransactionsService, DisputesService],
})
export class TransactionsModule {}
