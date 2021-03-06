import { IXyoOriginBlockRepository } from './xyo-origin-block-repository'
import { XyoIterableStructure } from '@xyo-network/object-model'

export class XyoMemoryBlockRepository implements IXyoOriginBlockRepository {
  private blockMapping: Map<string, Buffer> = new Map()

  public async removeOriginBlock(hash: Buffer): Promise<void> {
    this.blockMapping.delete(hash.toString('base64'))
  }

  public async addOriginBlock(hash: Buffer, block: Buffer): Promise<void> {
    this.blockMapping.set(hash.toString('base64'), block)
  }

  public async getOriginBlock(hash: Buffer): Promise<Buffer | undefined> {
    return this.blockMapping.get(hash.toString('base64'))
  }

  public async addOriginBlocks(hashes: Buffer, blocks: Buffer): Promise<void> {
    const blockStructure = new XyoIterableStructure(blocks)
    const hashesStructure = new XyoIterableStructure(hashes)
    const blockIt = blockStructure.newIterator()
    const hashIt = hashesStructure.newIterator()

    while (blockIt.hasNext()) {
      const block = blockIt.next().value
      const hash = hashIt.next().value
      this.addOriginBlock(hash.getAll().getContentsCopy(), block.getAll().getContentsCopy())
    }
  }

  public async getOriginBlocks(limit?: number, offset?: Buffer): Promise<{items: Buffer[], total: number}> {
    throw new Error('Not implemented')
  }
}
