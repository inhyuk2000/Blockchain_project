import { ethers } from "ethers";

/**
 * ImageAuthenticator 등록 컨트랙트와 동일 주소에서 구매 호출 (컨트랙트에 해당 함수가 있어야 함).
 * 예: buyImage(string pHash) payable — 등록 시점과 동일한 price 단위로 value 전송.
 */
const PURCHASE_ABI = ["function buyImage(string pHash) payable"];

const DEFAULT_CONTRACT_ADDRESS = "0x6154ab54f64106e00C715EBfC7cE6ce8C5dfF9CB";

function randomTxHash() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

function shouldUseStub() {
  return import.meta.env.VITE_STUB_ONCHAIN === "true";
}

async function ensureWalletChain(ethereum) {
  const raw = import.meta.env.VITE_CHAIN_ID?.trim();
  if (!raw) return;
  const targetId = Number.parseInt(raw, 10);
  if (!Number.isInteger(targetId)) return;

  const chainIdHex = `0x${targetId.toString(16)}`;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (switchError) {
    if (switchError?.code !== 4902 || !import.meta.env.VITE_RPC_URL?.trim()) throw switchError;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: import.meta.env.VITE_CHAIN_NAME?.trim() || "Custom RPC",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [import.meta.env.VITE_RPC_URL.trim()],
        },
      ],
    });
  }
}

async function purchaseOnChainReal({ imageHash, price }) {
  const ethereum = window.ethereum;
  if (!ethereum) {
    throw new Error("MetaMask 또는 EIP-1193 지갑을 설치하고 연결해 주세요.");
  }

  await ensureWalletChain(ethereum);

  const contractAddress = (
    import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || DEFAULT_CONTRACT_ADDRESS
  ).trim();

  if (!ethers.isAddress(contractAddress)) {
    throw new Error("VITE_CONTRACT_ADDRESS가 유효한 이더리움 주소가 아닙니다.");
  }

  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(contractAddress, PURCHASE_ABI, signer);

  const value = BigInt(price);
  const tx = await contract.buyImage(imageHash, { value });
  const receipt = await tx.wait();
  const verified = receipt?.status === 1;

  return {
    txHash: tx.hash,
    ok: verified,
    blockNumber:
      receipt?.blockNumber !== undefined && receipt?.blockNumber !== null
        ? Number(receipt.blockNumber)
        : null,
  };
}

/**
 * 온체인 구매 트랜잭션. `VITE_STUB_ONCHAIN=true`일 때는 네트워크 호출 없이 성공 스텁.
 */
export async function purchaseImageOnChain({ imageHash, price }) {
  if (shouldUseStub()) {
    return {
      txHash: randomTxHash(),
      ok: true,
      blockNumber: null,
    };
  }

  return purchaseOnChainReal({ imageHash, price });
}
