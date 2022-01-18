import { IMethodHandlerFactoryRecord } from '../../types/networkInfo';
import { SwapExactEthForTokensHandler } from './swapExactEthForTokens';
import { network } from '../../../constants';

export const uniV2Handlers: IMethodHandlerFactoryRecord = {
    ['0x7ff36ab5']: async (tx, to) => (new SwapExactEthForTokensHandler(tx, to, network.frUnitAddress)),
}