import { IMethod } from '../../types/networkInfo';
import { SwapExactEthForTokensHandler } from './swapExactEthForTokens';
import { getTokensListForNetwork } from '../../helpers';
import { chainId } from '../../../constants';

export const uniV2Handlers: IMethod = {
    ['0x7ff36ab5']: async (tx, to) => (new SwapExactEthForTokensHandler(tx, to)),
}