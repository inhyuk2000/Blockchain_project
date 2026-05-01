import { ethers } from "ethers";

/**
 * ImageAuthenticator 컨트랙트 (block_chain_solidity) 호출용 최소 ABI.
 */
const IMAGE_AUTHENTICATOR_ABI = [
  "function registerImage(string pHash, uint256 price)",
  "event ImageRegistered(address indexed owner, string pHash, uint256 price, uint256 timestamp)",
];

const DEFAULT_CONTRACT_ADDRESS = "0x6154ab54f64106e00C715EBfC7cE6ce8C5dfF9CB";

function randomTxHash() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `0x${hex}`;
}

/** 스텁은 명시적으로만 (기본: 항상 실제 registerImage 트랜잭션) */
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

async function registerOnChainReal({ imageHash, price }) {
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
  const contract = new ethers.Contract(contractAddress, IMAGE_AUTHENTICATOR_ABI, signer);

  const tx = await contract.registerImage(imageHash, BigInt(price));
  const receipt = await tx.wait();
  const verified = receipt?.status === 1;
  const blockNumber =
    receipt?.blockNumber !== undefined && receipt?.blockNumber !== null
      ? Number(receipt.blockNumber)
      : null;

  return {
    txHash: tx.hash,
    verificationStatus: verified ? "VERIFIED" : "FAILED",
    blockNumber,
  };
}

/**
 * 온체인 registerImage 실행 (MetaMask). `VITE_STUB_ONCHAIN=true`일 때만 거짓 tx.
 */
export async function registerImageOnChain({ imageHash, price, metadata }) {
  void metadata;

  if (shouldUseStub()) {
    return {
      txHash: randomTxHash(),
      verificationStatus: "VERIFIED",
      blockNumber: null,
    };
  }

  return registerOnChainReal({ imageHash, price });
}
