import { Injectable } from '@nestjs/common';

/**
 * [fill: the double-entry primitive. A single public method like
 *   post({ transactionId, debit: {bucket, amount}, credit: {bucket, amount} })
 * that writes the balanced pair in ONE db transaction and refuses to write if
 * debit != credit. Plus a balanceOf(bucket) that SUMs entries. Keep the
 * invariant (debits == credits) enforced in code AND covered by a test —
 * that test is a strong correctness signal for a money system.]
 */
@Injectable()
export class LedgerService {
  async post(/* [fill: balanced debit+credit entry] */): Promise<void> {
    throw new Error('LedgerService.post: [fill] not implemented');
  }

  async balanceOf(/* [fill: bucket: string] */): Promise<bigint> {
    throw new Error('LedgerService.balanceOf: [fill] not implemented');
  }
}
