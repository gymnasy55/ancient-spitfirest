import { signer } from "../../constants";
import { BigNumber, Overrides, PayableOverrides } from "ethers";
import { FrUnit } from '../../out/typechain/FrUnit';
import { UniswapRouterV2 } from '../../out/typechain/UniswapRouterV2';

export class SwapV2Service {
    private _unit: FrUnit;

    public get unit(): FrUnit {
        return this._unit;
    }

    private router: UniswapRouterV2;

    public readonly BASE_POINTS: number = 10000;

    constructor(unit: FrUnit, swapRouter: UniswapRouterV2) {
        this._unit = unit;
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
        slippage: number,
        path: string[]
    ) {
        return (await this.unit.getAmountOutWithSlippage(
            this.router.address,
            amountIn,
            this.toBasePoints(slippage),
            path
        ));
    }

    public async swapExactETHForTokens(
        amountEth: BigNumber,
        path: string[],
        maxSlippage: number,
        deadline: BigNumber,
        overrides?: Overrides & { from?: string | Promise<string> }
    ) {
        return this.unit.swapExactEthForTokensUniV2(
            this.router.address,
            path,
            amountEth,
            this.toBasePoints(maxSlippage),
            deadline,
            {
                ...overrides
            }
        )
    }

    public async swapExactTokensForETH(
        maxSlippage: number,
        path: string[],
        deadline: BigNumber,
        overrides?: Overrides & { from?: string | Promise<string> }
    ) {
        return this.unit.swapExactTokensForEthUniV2(
            this.router.address,
            path,
            this.toBasePoints(maxSlippage),
            deadline,
            {
                ...overrides
            }
        )
    }

    public callStatic = {
        swapExactETHForTokens: async (
            amountEth: BigNumber,
            path: string[],
            maxSlippage: number,
            deadline: BigNumber,
        ) => {
            return this.unit.callStatic.swapExactEthForTokensUniV2(
                this.router.address,
                path,
                amountEth,
                this.toBasePoints(maxSlippage),
                deadline,
            )
        },

        swapExactTokensForETH: async (
            maxSlippage: number,
            path: string[],
            deadline: BigNumber,
        ) => {
            return this.unit.callStatic.swapExactTokensForEthUniV2(
                this.router.address,
                path,
                this.toBasePoints(maxSlippage),
                deadline,
            )
        }
    }


    private toBasePoints(val: number): BigNumber {
        return BigNumber.from(parseInt((val * this.BASE_POINTS).toString()));
    }
}