import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiRequest } from "./api";
import { getAccessToken } from "./auth";
import AppBottomNav from "./AppBottomNav";

export default function VerifyPage() {
  const navigate = useNavigate();
  const token = getAccessToken();
  const [file, setFile] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const onPick = (e) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError("");
    setResult(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    if (!file) {
      setError("검증할 이미지 파일을 선택하세요.");
      return;
    }
    const fd = new FormData();
    fd.append("image", file);
    try {
      setPending(true);
      setError("");
      setResult(null);
      const data = await apiRequest("/verification/check", { method: "POST", body: fd, token });
      setResult(data);
    } catch (err) {
      setResult(null);
      if (err instanceof ApiError) {
        if (err.status === 413) {
          setError("파일 크기가 너무 큽니다. (10MB 이하)");
        } else {
          setError(err.message);
        }
      } else {
        setError("요청에 실패했습니다.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="appShell">
      <header className="detailTopBar">
        <button type="button" className="iconBtn" onClick={() => navigate("/profile")} aria-label="뒤로">
          ←
        </button>
        <h1 className="detailTopTitle">진품 검증</h1>
        <span className="iconBtn ghostIcon" aria-hidden />
      </header>

      <section className="contentArea verifyPage">
        <p className="muted verifyLead">
          원본 파일은 등록 시 저장된 해시와, <strong>서버에서 발급한 워터마크 PNG</strong>는 발급 시 기록된 해시와 각각 비교합니다.
          브라우저 데모 다운로드(<code>VITE_DEMO_UI_TEST</code>)로 받은 파일은 서버에 해시가 없어 검증되지 않습니다.
        </p>

        <form className="verifyForm" onSubmit={submit}>
          <label className="verifyFileLabel">
            <span className="muted">이미지 파일</span>
            <input type="file" accept="image/*" onChange={onPick} disabled={pending} />
          </label>
          <button type="submit" className="primary profileWideBtn" disabled={pending}>
            {pending ? "검증 중…" : "검증하기"}
          </button>
        </form>

        {error && <p className="errorText">{error}</p>}

        {result && (
          <div className={`verifyResult ${result.isVerified ? "verifyOk" : "verifyNo"}`}>
            <div className="verifyStatusRow">
              <strong>{result.verificationStatus}</strong>
              <span className="muted">
                {result.isVerified
                  ? result.verificationStatus === "MATCHED_WATERMARK"
                    ? "워터마크 발급본 일치"
                    : "원본 일치"
                  : "불일치"}
              </span>
            </div>
            {result.verificationStatus === "MATCHED_WATERMARK" && result.deliveredContentHash != null && (
              <p className="verifyMono">
                <span className="muted">워터마크 파일 해시</span> {result.deliveredContentHash}
              </p>
            )}
            {result.imageHash != null && (
              <p className="verifyMono">
                <span className="muted">imageHash</span> {result.imageHash}
              </p>
            )}
            {result.isVerified && result.imageId != null && (
              <>
                <p>
                  <span className="muted">imageId</span> {result.imageId}
                </p>
                {result.orderId != null && (
                  <p>
                    <span className="muted">orderId</span> {result.orderId}
                  </p>
                )}
                {result.txHash != null && result.txHash !== "" && (
                  <p className="verifyMono">
                    <span className="muted">txHash</span> {result.txHash}
                  </p>
                )}
                <button type="button" className="outlineBtn profileWideBtn" onClick={() => navigate(`/images/${result.imageId}`)}>
                  작품 상세 보기
                </button>
              </>
            )}
            {!result.isVerified && result.reason != null && <p className="verifyReason">{result.reason}</p>}
          </div>
        )}
      </section>

      <AppBottomNav />
    </main>
  );
}
