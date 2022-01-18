import { UniswapRouterV2, UniswapRouterV2__factory } from "../../out/typechain";
import { signer } from "../../constants";
import { BigNumber, Overrides, PayableOverrides } from "ethers";

export class SwapV2Service {
    private router: UniswapRouterV2

    constructor(swapRouter: UniswapRouterV2) {
        this.router = swapRouter;
    }

    // this method should return a price impact of a swap in %
    public async getPriceImpact(
        amountIn: BigNumber,
        path: string[]
    ): Promise<number> {
        // TODO 
        throw new Error('Method is not implemented');
    }

    public async getAmountOut(
        amountIn: BigNumber,
        path: string[]
    ): Promise<BigNumber> {
        // TODO
        return (await this.router.getAmountsOut(
            amountIn,
            path
        ))[path.length - 1];
    }

    public async swapExactETHForTokens(
        amountEth: BigNumber,
        amountOutMin: BigNumber,
        path: string[],
        deadline: BigNumber,
        overrides?: Overrides & { from?: string | Promise<string> }
    ) {
        // TODO this method should be implemented using our smart contract
        return this.router.swapExactETHForTokens(
            amountOutMin,
            path,
            signer.address,
            deadline,
            {
                value: amountEth,
                ...overrides
            }
        )
    }

    public async swapExactTokensForETH(
        amountIn: BigNumber,
        amountOutMin: BigNumber,
        path: string[],
        deadline: BigNumber,
        overrides?: Overrides & { from?: string | Promise<string> }
    ) {
        // TODO this method should be implemented using our smart contract
        return this.router.swapExactTokensForETH(
            amountIn,
            amountOutMin,
            path,
            signer.address,
            deadline,
            {
                ...overrides
            }
        )
    }
}