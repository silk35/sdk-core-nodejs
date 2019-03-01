/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Friday, 21st December 2018 12:55:40 pm
 * @Email:  developer@xyfindables.com
 * @Filename: index.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Wednesday, 27th February 2019 11:13:15 am
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

export {
  IConsensusContract,
  IContractData
} from './@types'

import Web3 from 'web3'

import { IConsensusContract, IContractData, IStakableTokenContract, IContractAbi } from './@types'
import { XyoIpfsClient, IXyoIpfsClient } from '@xyo-network/ipfs-client'
import { XyoBase } from '@xyo-network/base'
import { XyoError, XyoErrors } from '@xyo-network/errors'
import { HttpProvider } from 'web3-providers'
import { Contract } from 'web3-eth-contract'

export class XyoWeb3Service extends XyoBase {
  private web3: Web3 | undefined
  private ipfs: XyoIpfsClient
  constructor (
    private readonly web3ProviderArgs: any,
    public readonly currentUser: string,
    private readonly existingContracts: {[contractName: string]: IContractData}
  ) {
    super()
    this.ipfs = new XyoIpfsClient({
      host: "ipfs.layerone.co",
      port: '5002',
      protocol: "https"
    })
  }

  public async signMessage(message: string): Promise<string> {
    const web3 = await this.getOrInitializeWeb3()
    return web3.eth.sign(message, this.currentUser)
  }

  public async getContractByName(name: string): Promise<Contract> {
    const web3 = await this.getOrInitializeWeb3()
    const abi = await this.getABIOfContract(name)
    const address = await this.getAddressOfContract(name)

    try {
      const contract = new web3.eth.Contract(abi, address)
      return contract
    } catch (err) {
      this.logError(`There was an error retrieving contract with name ${name}`, err)
      throw err
    }
  }

  public async getABIOfContract(name: string): Promise<any> {
    const hash = this.existingContracts[name].ipfsHash
    const rawData = await this.ipfs.readFile(hash)
    const ipfsData = JSON.parse(String(rawData))

    return ipfsData.abi
  }

  public async getAddressOfContract(name: string): Promise<string> {
    const contract = this.existingContracts[name]
    if (!contract) {
      throw new XyoError(`Could not find contract with name ${name}`, XyoErrors.CRITICAL)
    }

    return contract.address
  }

  public async getOrInitializeSC(name: string): Promise<any> {
    if (this.existingContracts[name].contract) {
      return this.existingContracts[name].contract
    }
    this.existingContracts[name].contract = await this.getContractByName(name)
    return this.existingContracts[name].contract
  }

  private async getOrInitializeWeb3(): Promise<Web3> {
    if (this.web3) {
      return this.web3
    }

    if (!this.web3ProviderArgs) {
      throw new XyoError('No web3 provider args provided', XyoErrors.CRITICAL)
    }

    if (typeof this.web3ProviderArgs !== 'string') { // Consider extending this
      throw new XyoError('Web3 initialization parameters need to be a string', XyoErrors.CRITICAL)
    }

    const httpProvider = new HttpProvider(this.web3ProviderArgs)
    this.web3 = new Web3(httpProvider)
    return this.web3
  }
}
