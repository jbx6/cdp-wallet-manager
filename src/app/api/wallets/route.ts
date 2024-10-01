import { NextResponse } from 'next/server';
import { Wallet } from '@coinbase/coinbase-sdk';
import { formatNetworkId } from '@/utils/stringUtils';
import  '@/lib/server/coinbase';
import {addSeedRecord} from "@/app/db/db";
import {WalletResponse} from "@/app/api/wallets/[walletId]/route";

export interface WalletListResponse {
  id: string;
  name: string;
  network: string;
} 

export async function GET() {
  console.log("Fetching wallets")
  try {
    const allWallets = await Wallet.listWallets();
    const wallets = await Promise.all(
      allWallets.map(async (wallet) => {
        try {
          await wallet.getDefaultAddress();
          return wallet;
        } catch (error) {
          console.error(`Error fetching default address for wallet ${wallet.getId()}:`, error);
          return null;
        }
      })
    );
    const filteredWallets = wallets.filter((wallet): wallet is Wallet => wallet !== null);
    const walletListResponse = filteredWallets.map((wallet) => ({
      id: wallet.getId(),
      name: "My Wallet",
      network: formatNetworkId(wallet.getNetworkId()),
    }));
    return NextResponse.json(walletListResponse);
  } catch (error) {
    console.error('Error fetching wallets:', error);
    return NextResponse.json({ error: 'Failed to fetch wallets' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Check if ENCRYPTION_KEY is set
  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'ENCRYPTION_KEY is not set' }, { status: 500 });
  }

  const body = await request.json();
  const { networkId } = body;

  if (networkId === undefined) {
    return NextResponse.json({ error: 'Network ID is required' }, { status: 400 });
  }

  let walletResponse: WalletResponse;
  try {

    console.log("Creating wallet for network: ", networkId);
    
    const wallet = await Wallet.create({networkId: networkId});
    const defaultAddress = await wallet.getDefaultAddress();
    const walletId = wallet.getId();
    const walletData = await wallet.export();

    // Insert the wallet data into the database.
    await addSeedRecord(walletId as string, walletData.seed, process.env.ENCRYPTION_KEY as string);

    // Fetch balances
    const balances = await wallet.listBalances();
    const formattedBalances: Record<string, number> = {};
    balances.forEach((balance, currency) => {
      formattedBalances[currency] = parseFloat(balance.toString());
    });

    walletResponse = {
      id: wallet.getId() as string,
      network: formatNetworkId(wallet.getNetworkId()),
      addresses: [defaultAddress.getId()],
      defaultAddress: defaultAddress.getId(),
      balances: formattedBalances,
    };

    return NextResponse.json(walletResponse);
  } catch (error) {
    console.error('Error fetching wallet:', error);
    return NextResponse.json({ error: 'Failed to fetch wallet' }, { status: 500 });
  }
}
