/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Wednesday, 21st November 2018 11:39:13 am
 * @Email:  developer@xyfindables.com
 * @Filename: index.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Thursday, 29th November 2018 3:19:48 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoBase } from '@xyo-network/base'
import { XyoNode } from '@xyo-network/node'
import { IXyoNetworkProvider, IXyoNetworkProcedureCatalogue, CatalogueItem } from '@xyo-network/network'
import { XyoServerTcpNetwork, XyoClientTcpNetwork, IXyoNetworkAddressProvider } from '@xyo-network/network.tcp'
import { XyoSimplePeerConnectionDelegate, IXyoPeerConnectionDelegate, IXyoPeerConnectionHandler, XyoPeerConnectionHandler } from '@xyo-network/peer-connections'
import { XyoPeerInteractionRouter } from '@xyo-network/peer-interaction-router'
import { XyoBoundWitnessStandardServerInteraction, XyoBoundWitnessTakeOriginChainServerInteraction, XyoBoundWitnessStandardClientInteraction } from '@xyo-network/peer-interaction-handlers'
import { IXyoHashProvider, getHashingProvider, IXyoHash } from '@xyo-network/hashing'

import {
  XyoBoundWitnessHandlerProvider,
  IXyoBoundWitnessPayloadProvider,
  IXyoBoundWitnessSuccessListener,
  XyoNestedBoundWitnessExtractor,
  XyoBoundWitnessPayloadProvider
} from '@xyo-network/peer-interaction'

import { IXyoOriginChainRepository, XyoOriginChainStateInMemoryRepository } from '@xyo-network/origin-chain'
import { IXyoOriginBlockRepository, XyoOriginBlockRepository } from '@xyo-network/origin-block-repository'
import { XyoBoundWitnessValidator, IXyoBoundWitnessSigningDataProducer, XyoBoundWitnessSigningService, IXyoBoundWitness, IXyoPayload, XyoBoundWitnessSigningDataProducer } from '@xyo-network/bound-witness'
import { IXyoSerializationService, IXyoTypeSerializer, XyoSerializationService } from '@xyo-network/serialization'
import { XyoInMemoryStorageProvider } from '@xyo-network/storage'
import { schema } from '@xyo-network/serialization-schema'
import { IXyoPublicKey, IXyoSignature, IXyoSigner } from '@xyo-network/signing'
import { recipes } from './xyo-serialization-recipes'

class SimpleCache implements ISimpleCache {
  private readonly cache: {[s: string]: any} = {}

  public getOrCreate<T>(name: string, initializer: () => T): T {
    if (this.cache[name]) {
      return this.cache[name] as T
    }

    const t = initializer()
    this.cache[name] = t
    return t
  }
}

// tslint:disable-next-line:max-classes-per-file
export class XyoTestNode extends XyoBase {

  private readonly serviceCache = new SimpleCache()

  public start() {
    const node = new XyoNode(this.getPeerConnectionDelegate())
    node.start()
  }

  private getPeerConnectionDelegate(): IXyoPeerConnectionDelegate {
    return this.serviceCache.getOrCreate('IXyoPeerConnectionDelegate', () => {
      return new XyoSimplePeerConnectionDelegate(
        this.getNetwork(),
        this.getCatalogue(),
        this.getPeerConnectionHandler()
      )
    })
  }

  private getNetwork(): IXyoNetworkProvider {
    return this.serviceCache.getOrCreate('IXyoNetworkProvider', () => {
      if (process.env.XYO_CLIENT) {
        this.logInfo(`Running in client mode`)
        return new XyoClientTcpNetwork(this.getNetworkAddressProvider())
      }
      this.logInfo(`Running in server mode`)
      return new XyoServerTcpNetwork(11000)
    })
  }

  private getNetworkAddressProvider(): IXyoNetworkAddressProvider {
    return this.serviceCache.getOrCreate('IXyoNetworkAddressProvider', () => {
      return {
        next: async () => {
          return {
            host: '127.0.0.1',
            port: 11000
          }
        }
      }
    })
  }

  private getCatalogue(): IXyoNetworkProcedureCatalogue {
    return this.serviceCache.getOrCreate('IXyoNetworkProcedureCatalogue', () => {
      return {
        canDo(catalogueItem: CatalogueItem) {
          return catalogueItem === CatalogueItem.BOUND_WITNESS || catalogueItem === CatalogueItem.GIVE_ORIGIN_CHAIN
        },
        getCurrentCatalogue() {
          return [
            CatalogueItem.BOUND_WITNESS,
            CatalogueItem.GIVE_ORIGIN_CHAIN
          ]
        }
      }
    })
  }

  private getPeerConnectionHandler(): IXyoPeerConnectionHandler {
    return this.serviceCache.getOrCreate('IXyoPeerConnectionHandler', () => {
      return new XyoPeerConnectionHandler(
        this.getPeerInteractionRouter(),
        this.getPeerInteractionRouter()
      )
    })
  }

  private getPeerInteractionRouter(): XyoPeerInteractionRouter {
    return this.serviceCache.getOrCreate('XyoPeerInteractionRouter', () => {
      const peerInteractionRouter = new XyoPeerInteractionRouter()

      // Routes
      peerInteractionRouter.use(
        CatalogueItem.BOUND_WITNESS,
        () => {
          return this.getStandardBoundWitnessHandlerProvider()
        }
      )

      peerInteractionRouter.use(
        CatalogueItem.TAKE_ORIGIN_CHAIN,
        () => {
          return this.getTakeOriginChainBoundWitnessHandlerProvider()
        }
      )
      return peerInteractionRouter
    })
  }

  private getStandardBoundWitnessHandlerProvider(): XyoBoundWitnessHandlerProvider {
    return this.serviceCache.getOrCreate('XyoStandardBoundWitnessHandlerProvider', () => {
      return new XyoBoundWitnessHandlerProvider(
        this.getHashingProvider(),
        this.getOriginStateRepository(),
        this.getOriginBlockRepository(),
        this.getBoundWitnessPayloadProvider(),
        this.getBoundWitnessSuccessListener(),
        {
          newInstance: (signers, payload) =>  {
            if (process.env.XYO_CLIENT) {
              return new XyoBoundWitnessStandardClientInteraction(
                signers,
                payload,
                this.getBoundWitnessSigningService(),
                this.getBoundWitnessSerializer()
              )
            }
            return new XyoBoundWitnessStandardServerInteraction(
              signers,
              payload,
              this.getBoundWitnessSigningService(),
              this.getBoundWitnessSerializer()
            )
          }
        },
        this.getBoundWitnessValidator(),
        this.getBoundWitnessSigningDataProducer(),
        this.getNestedBoundWitnessExtractor(),
        this.getHashSerializer()
      )
    })
  }

  private getTakeOriginChainBoundWitnessHandlerProvider(): XyoBoundWitnessHandlerProvider {
    return this.serviceCache.getOrCreate('XyoTakeOriginChainBoundWitnessHandlerProvider', () => {
      return new XyoBoundWitnessHandlerProvider(
        this.getHashingProvider(),
        this.getOriginStateRepository(),
        this.getOriginBlockRepository(),
        this.getBoundWitnessPayloadProvider(),
        this.getBoundWitnessSuccessListener(),
        {
          newInstance: (signers, payload) =>  {
            return new XyoBoundWitnessTakeOriginChainServerInteraction(
              signers,
              payload,
              this.getBoundWitnessSigningService(),
              this.getBoundWitnessSerializer()
            )
          }
        },
        this.getBoundWitnessValidator(),
        this.getBoundWitnessSigningDataProducer(),
        this.getNestedBoundWitnessExtractor(),
        this.getHashSerializer()
      )
    })
  }

  private getBoundWitnessSigningService(): XyoBoundWitnessSigningService {
    return this.serviceCache.getOrCreate('XyoBoundWitnessSigningService', () => {
      return new XyoBoundWitnessSigningService(this.getBoundWitnessSigningDataProducer())
    })
  }

  private getHashingProvider(): IXyoHashProvider {
    return this.serviceCache.getOrCreate('IXyoHashProvider', () => {
      return getHashingProvider('sha256')
    })
  }

  private getOriginStateRepository(): IXyoOriginChainRepository {
    return this.serviceCache.getOrCreate('IXyoOriginChainRepository', () => {
      return new XyoOriginChainStateInMemoryRepository(
        0,
        undefined,
        [
          new MockSigner(new MockPublicKey('EEEEEEEE'), new MockSignature('DDDDDDDD'))
        ],
        undefined,
        [],
        undefined
      )
    })
  }

  private getOriginBlockRepository(): IXyoOriginBlockRepository {
    return this.serviceCache.getOrCreate('IXyoOriginBlockRepository', () => {
      return new XyoOriginBlockRepository(
        new XyoInMemoryStorageProvider(),
        this.getBoundWitnessSerializer(),
        this.getHashSerializer()
      )
    })
  }

  private getBoundWitnessPayloadProvider(): IXyoBoundWitnessPayloadProvider {
    return new XyoBoundWitnessPayloadProvider()
  }

  private getBoundWitnessSuccessListener(): IXyoBoundWitnessSuccessListener {
    return this.serviceCache.getOrCreate('IXyoBoundWitnessSuccessListener', () => {
      return {
        onBoundWitnessSuccess: async (boundWitness: IXyoBoundWitness) => {
          this.logInfo(`BoundWitness Success 😁`)
        }
      }
    })
  }

  private getBoundWitnessValidator(): XyoBoundWitnessValidator {
    return this.serviceCache.getOrCreate('XyoBoundWitnessValidator', () => {
      return new XyoBoundWitnessValidator(
        this.getBoundWitnessSigningDataProducer(),
        this.getExtractIndexFromPayloadFn(),
        {
          checkPartyLengths: false,
          checkIndexExists: false,
          checkCountOfSignaturesMatchPublicKeysCount: false,
          validateSignatures: false,
          validateHash: false
        }
      )
    })
  }

  private getExtractIndexFromPayloadFn(): (payload: IXyoPayload) => number | undefined {
    return this.serviceCache.getOrCreate('XyoExtractIndexFromPayloadFn', () => {
      return (payload: IXyoPayload) => {
        throw new Error(`Not yet implemented`)
      }
    })
  }

  private getBoundWitnessSigningDataProducer(): IXyoBoundWitnessSigningDataProducer {
    return this.serviceCache.getOrCreate('IXyoBoundWitnessSigningDataProducer', () => {
      return new XyoBoundWitnessSigningDataProducer(schema)
    })
  }

  private getNestedBoundWitnessExtractor(): XyoNestedBoundWitnessExtractor {
    return this.serviceCache.getOrCreate('XyoNestedBoundWitnessExtractor', () => {
      return new XyoNestedBoundWitnessExtractor(() => false) // TODO
    })
  }

  private getSerializationService(): IXyoSerializationService  {
    return this.serviceCache.getOrCreate('IXyoSerializationService', () => {
      return new XyoSerializationService(schema, this.getRecipes())
    })
  }

  private getBoundWitnessSerializer(): IXyoTypeSerializer < IXyoBoundWitness >  {
    return this.serviceCache.getOrCreate('XyoBoundWitnessSerializer', () => {
      return this.getSerializationService().getInstanceOfTypeSerializer<IXyoBoundWitness>()
    })
  }

  private getHashSerializer(): IXyoTypeSerializer < IXyoHash >  {
    return this.serviceCache.getOrCreate('XyoHashSerializer', () => {
      return this.getSerializationService().getInstanceOfTypeSerializer<IXyoHash>()
    })
  }

  private getRecipes() {
    return this.serviceCache.getOrCreate('XyoRecipes', () => {
      return recipes
    })
  }
}

if (require.main === module) {
  console.log('got here')
  const testNode = new XyoTestNode()
  testNode.start()
}

interface ISimpleCache {
  getOrCreate<T>(name: string, initializer: () => T): T
}

// tslint:disable-next-line:max-classes-per-file
class MockSigner implements IXyoSigner {

  constructor (
    public readonly publicKey: MockPublicKey,
    public readonly signature: MockSignature
  ) {}

  get privateKey () {
    return 'abc'
  }

  public async signData(data: Buffer): Promise<IXyoSignature> {
    return this.signature
  }
}

// tslint:disable-next-line:max-classes-per-file
class MockPublicKey implements IXyoPublicKey {
  public schemaObjectId = 0x10

  constructor(private readonly publicKeyHexString: string) {}

  public getRawPublicKey(): Buffer {
    return Buffer.from(this.publicKeyHexString, 'hex')
  }

  public serialize(): Buffer {
    return this.getRawPublicKey()
  }
}

// tslint:disable-next-line:max-classes-per-file
class MockSignature implements IXyoSignature {

  public schemaObjectId = schema.stubSignature.id

  constructor (private readonly desiredSignatureHexString: string) {}

  public async verify(data: Buffer, publicKey: IXyoPublicKey): Promise<boolean> {
    return data.toString('hex') === this.desiredSignatureHexString
  }

  public get encodedSignature (): Buffer {
    return Buffer.from(this.desiredSignatureHexString, 'hex')
  }

  public serialize(): Buffer {
    return this.encodedSignature
  }
}
