import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, API_BASE_URL, apiRequest } from "./api";
import { getAccessToken } from "./auth";
import AppBottomNav from "./AppBottomNav";
import { demoDownloadDetailImage, isDemoUiTest } from "./demoUiTest";
import { purchaseImageOnChain } from "./purchaseImageOnChain";

/** 스펙의 paymentMethod + 온체인 결제 구분 */
const PAYMENT_METHOD_ONCHAIN = "BLOCKCHAIN";

function formatVerificationStatus(status) {
  if (!status) return "—";
  const u = String(status).toUpperCase();
  if (u === "VERIFIED") return "Verified";
  return String(status);
}

function saleStatusLabel(isSold) {
  return isSold ? "판매 완료" : "판매 중";
}

function txExplorerUrl(hash) {
  const prefix = import.meta.env.VITE_TX_EXPLORER_PREFIX?.trim();
  if (prefix) return `${prefix.replace(/\/$/, "")}/${hash}`;
  return `https://sepolia.etherscan.io/tx/${encodeURIComponent(hash)}`;
}

export default function ImageDetailPage() {
  const { imageId } = useParams();
  const navigate = useNavigate();
  const token = getAccessToken();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const [deletePending, setDeletePending] = useState(false);
  /** GET /images/:id/verification 결과 (Check Verification 클릭 시 채움) */
  const [verifySnap, setVerifySnap] = useState(null);
  const [verifyPending, setVerifyPending] = useState(false);
  const [purchasePending, setPurchasePending] = useState(false);
  const [downloadPending, setDownloadPending] = useState(false);
  const verificationBlockRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }
      try {
        setPending(true);
        setError("");
        const res = await apiRequest(`/images/${imageId}`, { token });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof ApiError ? e.message : "불러오지 못했습니다.";
          setError(msg);
          setData(null);
        }
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageId, token, navigate]);

  useEffect(() => {
    setVerifySnap(null);
  }, [imageId]);

  const handleDelete = async () => {
    if (!data?.isOwner || !window.confirm("이 이미지를 삭제할까요?")) return;
    try {
      setDeletePending(true);
      await apiRequest(`/images/${imageId}`, { method: "DELETE", token });
      navigate("/home", { replace: false });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletePending(false);
    }
  };

  const handlePurchase = async () => {
    if (!token || !data || purchasePending || data.isSold || data.isOwner) return;
    const pHash = data.verification?.imageHash;
    if (!pHash || typeof pHash !== "string") {
      alert("이미지 해시 정보가 없어 구매할 수 없습니다.");
      return;
    }
    try {
      setPurchasePending(true);
      const chainResult = await purchaseImageOnChain({
        imageHash: pHash,
        price: data.price,
      });
      if (!chainResult.ok) {
        throw new Error("블록체인 트랜잭션이 성공하지 않았습니다.");
      }
      const order = await apiRequest("/orders", {
        method: "POST",
        token,
        body: {
          imageId: Number(imageId),
          paymentMethod: PAYMENT_METHOD_ONCHAIN,
        },
      });
      setData((prev) =>
        prev ? { ...prev, isSold: true, purchasedOrderId: order.orderId } : prev
      );
      alert(`구매가 완료되었습니다. 주문 번호: ${order.orderId}`);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "구매 처리에 실패했습니다.";
      alert(msg);
    } finally {
      setPurchasePending(false);
    }
  };

  const handleWatermarkDownload = async () => {
    if (!token || !data?.purchasedOrderId || downloadPending || isDemoUiTest()) return;
    try {
      setDownloadPending(true);
      const res = await apiRequest(`/images/${imageId}/download`, {
        method: "POST",
        token,
        body: { orderId: data.purchasedOrderId },
      });
      const url = res?.downloadUrl;
      if (url && typeof url === "string") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "다운로드 링크를 받지 못했습니다.");
    } finally {
      setDownloadPending(false);
    }
  };

  const handleDemoLocalWatermarkDownload = async () => {
    if (!token || !data || downloadPending) return;
    try {
      setDownloadPending(true);
      await demoDownloadDetailImage(data.imageUrl, data.title, data.id);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "데모 다운로드에 실패했습니다.");
    } finally {
      setDownloadPending(false);
    }
  };

  const checkVerification = async () => {
    if (!token || verifyPending) return;
    try {
      setVerifyPending(true);
      const v = await apiRequest(`/images/${imageId}/verification`, { token });
      setVerifySnap(v);
      window.setTimeout(() => {
        verificationBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        const hash = v?.txHash;
        if (
          hash &&
          window.confirm("블록체인 트랜잭션(온체인 검증) 페이지를 새 탭으로 열까요?")
        ) {
          window.open(txExplorerUrl(hash), "_blank", "noopener,noreferrer");
        }
      }, 350);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "검증 정보를 불러오지 못했습니다.");
    } finally {
      setVerifyPending(false);
    }
  };

  return (
    <main className="appShell">
      <header className="detailTopBar">
        <button type="button" className="iconBtn" onClick={() => navigate(-1)} aria-label="뒤로">
          ←
        </button>
        <h1 className="detailTopTitle">Image Detail</h1>
        <button type="button" className="iconBtn ghostIcon" aria-hidden disabled>
          ⋯
        </button>
      </header>

      <section className="contentArea detailContent">
        {pending && <p className="muted">불러오는 중...</p>}
        {!pending && error && <p className="errorText">{error}</p>}
        {!pending && data && (
          <>
            <div className="detailPreviewWrap">
              <img
                className="detailPreviewImg"
                src={`${API_BASE_URL}${data.imageUrl}`}
                alt={data.title}
              />
            </div>

            <div className="detailMetaBlock">
              <h2 className="detailTitle">{data.title}</h2>
              <p className="detailSeller">Seller: {data.seller?.nickname ?? "—"}</p>
              <p className="muted detailCategoryLine">Category: {data.category}</p>
              <p className="detailPrice">$ {data.price}</p>
              <p className="detailSaleStatus">{saleStatusLabel(data.isSold)}</p>
            </div>

            <section className="detailSection">
              <h3 className="detailSectionTitle">Description</h3>
              <p className="detailDescription">{data.description || "—"}</p>
            </section>

            <p className="muted verificationPrehint">
              블록체인 검증 상세는 「Check Verification」을 누른 뒤 아래에 표시됩니다.
            </p>
            {isDemoUiTest() && (
              <p className="muted verificationPrehint">
                <strong>데모 UI 모드</strong>: 「데모 워터마크 다운로드」는 서버 주문 없이 브라우저에서 PNG만 만듭니다.
              </p>
            )}

            <div
              className={`detailActions ${
                !data.isOwner &&
                data.isSold &&
                !data.purchasedOrderId &&
                !isDemoUiTest()
                  ? "detailActionsSingle"
                  : ""
              }`}
            >
              <button
                type="button"
                className="outlineBtn"
                onClick={checkVerification}
                disabled={verifyPending}
              >
                {verifyPending ? "Checking…" : "Check Verification"}
              </button>
              {isDemoUiTest() && (
                <button
                  type="button"
                  className="outlineBtn"
                  onClick={handleDemoLocalWatermarkDownload}
                  disabled={downloadPending}
                >
                  {downloadPending ? "준비 중…" : "데모 워터마크 다운로드"}
                </button>
              )}
              {!data.isOwner && data.purchasedOrderId && !isDemoUiTest() && (
                <button
                  type="button"
                  className="outlineBtn"
                  onClick={handleWatermarkDownload}
                  disabled={downloadPending}
                >
                  {downloadPending ? "준비 중…" : "워터마크 다운로드"}
                </button>
              )}
              {!data.isOwner && !data.isSold && (
                <button
                  type="button"
                  className="primary purchaseBtn"
                  onClick={handlePurchase}
                  disabled={purchasePending}
                >
                  {purchasePending ? "구매 처리 중…" : "구매하기"}
                </button>
              )}
              {data.isOwner && (
                <button
                  type="button"
                  className="dangerBtn"
                  onClick={handleDelete}
                  disabled={deletePending}
                >
                  {deletePending ? "Deleting…" : "Delete Image"}
                </button>
              )}
            </div>

            {verifySnap && (
              <section ref={verificationBlockRef} className="detailSection verificationFetchedBelow">
                <h3 className="detailSectionTitle">Blockchain verification</h3>
                <p className="muted verificationFetchedLead">서버에서 조회한 블록체인 검증 정보입니다.</p>
                <div className="verificationCard">
                  <dl className="verificationDl">
                    <dt>Image ID</dt>
                    <dd>{verifySnap.imageId}</dd>
                    <dt>Status</dt>
                    <dd>{formatVerificationStatus(verifySnap.verificationStatus)}</dd>
                    <dt>Image Hash</dt>
                    <dd className="mono">{verifySnap.imageHash}</dd>
                    <dt>Tx Hash</dt>
                    <dd className="mono">{verifySnap.txHash}</dd>
                    <dt>Block Number</dt>
                    <dd>{verifySnap.blockNumber}</dd>
                    <dt>Contract Address</dt>
                    <dd className="mono">{verifySnap.contractAddress}</dd>
                    <dt>Registered at</dt>
                    <dd className="mono">{verifySnap.registeredAt || "—"}</dd>
                  </dl>
                </div>
              </section>
            )}
          </>
        )}
      </section>

      <AppBottomNav />
    </main>
  );
}
