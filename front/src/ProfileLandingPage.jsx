import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, API_BASE_URL, apiRequest } from "./api";
import { clearAccessToken, clearRefreshToken, getAccessToken } from "./auth";
import AppBottomNav from "./AppBottomNav";
import { buildMockOrdersFromImages, demoDownloadDetailImage, isDemoUiTest } from "./demoUiTest";

export default function ProfileLandingPage() {
  const navigate = useNavigate();
  const token = getAccessToken();
  const [me, setMe] = useState(null);
  const [liked, setLiked] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [downloadBusyOrderId, setDownloadBusyOrderId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setPending(true);
      setError("");
      setOrdersError("");
      const [meData, likedData] = await Promise.all([
        apiRequest("/users/me", { token }),
        apiRequest(`/users/me/favorites?page=0&size=24`, { token }).catch(() => []),
      ]);
      setMe(meData);
      setLiked(Array.isArray(likedData) ? likedData : []);

      if (isDemoUiTest()) {
        const imgs = await apiRequest(`/images?page=0&size=12&sort=latest`, { token });
        setOrders(buildMockOrdersFromImages(Array.isArray(imgs) ? imgs : []));
        setOrdersError("");
      } else {
        try {
          const ordersData = await apiRequest(`/users/me/orders?page=0&size=24`, { token });
          setOrders(Array.isArray(ordersData) ? ordersData : []);
        } catch (oe) {
          setOrders([]);
          setOrdersError(oe instanceof ApiError ? oe.message : "구매 내역을 불러오지 못했습니다.");
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "불러오지 못했습니다.");
      setMe(null);
      setLiked([]);
      setOrders([]);
      setOrdersError("");
    } finally {
      setPending(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const logout = () => {
    clearAccessToken();
    clearRefreshToken();
    navigate("/login", { replace: true });
  };

  const displayName = me?.name?.trim() || me?.nickname?.trim() || "User";
  const displayEmail = me?.email?.trim() || "—";

  const formatPurchasedAt = (iso) => {
    if (!iso || typeof iso !== "string") return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
      return d.toISOString().slice(0, 10);
    } catch {
      return iso.slice(0, 10);
    }
  };

  const handleOrderDownload = async (e, row) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token) return;
    try {
      setDownloadBusyOrderId(row.orderId);
      if (isDemoUiTest()) {
        const detail = await apiRequest(`/images/${row.imageId}`, { token });
        await demoDownloadDetailImage(detail.imageUrl, detail.title, detail.id);
        return;
      }
      const res = await apiRequest(`/images/${row.imageId}/download`, {
        method: "POST",
        token,
        body: { orderId: row.orderId },
      });
      const url = res?.downloadUrl;
      if (url && typeof url === "string") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "다운로드 링크를 받지 못했습니다.");
    } finally {
      setDownloadBusyOrderId(null);
    }
  };

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <h1>BLOCK PHOTO</h1>
          <p>Profile</p>
        </div>
        <div className="topBarActions">
          <span className="badge">Signed In</span>
          <button type="button" className="miniBtn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <section className="contentArea profileLanding">
        {pending && <p className="muted">불러오는 중...</p>}
        {error && <p className="errorText">{error}</p>}

        {!pending && me && (
          <>
            <div className="profileHeroRow">
              <div className="avatarPlaceholder profileAvatarSm" />
              <div className="profileHeroText">
                <div className="profileDisplayName">{displayName}</div>
                <div className="profileEmail">{displayEmail}</div>
              </div>
            </div>

            <button type="button" className="outlineBtn profileWideBtn" onClick={() => navigate("/profile/edit")}>
              Edit Profile
            </button>

            <button type="button" className="outlineBtn profileWideBtn" onClick={() => navigate("/profile/uploads")}>
              내가 업로드한 이미지 목록
            </button>

            <button type="button" className="outlineBtn profileWideBtn" onClick={() => navigate("/verify")}>
              파일 검증 · 진품 검증
            </button>

            <h3 className="profileSectionHeading">Purchase History</h3>
            {isDemoUiTest() && (
              <p className="muted profilePurchaseHint">
                <strong>데모 UI 모드</strong>(<code>VITE_DEMO_UI_TEST=true</code>): 목록은{" "}
                <code>GET /users/me/orders</code> 대신 홈 피드(<code>GET /images</code>)로 만든 더미입니다. 다운로드는 브라우저에서만
                워터마크를 붙입니다.
              </p>
            )}
            {ordersError && <p className="errorText profileOrdersError">{ordersError}</p>}
            {orders.length === 0 && !ordersError && !isDemoUiTest() && (
              <p className="muted profilePurchaseHint">
                구매 내역은 <strong>구매한 지갑</strong>으로 로그인할 때만 보입니다. 서버 로그의 Hardhat #1 주소·개인키로 로그인해
                보거나, 데모 업로더만 쓸 때는 프론트 <code>.env</code>에 <code>VITE_DEMO_UI_TEST=true</code> 를 설정하세요.
              </p>
            )}
            <div className="hStrip hStripTall profileStrip">
              {orders.length === 0 ? (
                <span className="muted">구매 내역이 없습니다.</span>
              ) : (
                orders.map((row) => (
                  <article
                    key={row.orderId}
                    className="profileStripCard clickableCard"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/images/${row.imageId}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/images/${row.imageId}`);
                      }
                    }}
                  >
                    <div className="imageCardVisual">
                      <span className="galleryCardCat">{row.orderStatus}</span>
                      <img
                        className="thumb thumbFill"
                        src={`${API_BASE_URL}${row.thumbnailUrl}`}
                        alt={row.title}
                      />
                    </div>
                    <div className="galleryHCBody">
                      <strong className="imageCardTitle">{row.title}</strong>
                      <div className="profileStripDate muted">${row.price}</div>
                      <div className="profileStripDate muted">구매 {formatPurchasedAt(row.purchasedAt)}</div>
                      <button
                        type="button"
                        className="outlineBtn profileOrderDownloadBtn"
                        disabled={downloadBusyOrderId === row.orderId}
                        onClick={(e) => handleOrderDownload(e, row)}
                      >
                        {downloadBusyOrderId === row.orderId ? "준비 중…" : "워터마크 다운로드"}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <h3 className="profileSectionHeading">Liked Lists</h3>
            <div className="hStrip hStripTall profileStrip">
              {liked.length === 0 ? (
                <span className="muted">찜한 이미지가 없습니다.</span>
              ) : (
                liked.map((item) => (
                  <article
                    key={item.id}
                    className="profileStripCard clickableCard"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/images/${item.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/images/${item.id}`);
                      }
                    }}
                  >
                    <div className="imageCardVisual">
                      <span className="galleryCardCat">{item.verificationStatus}</span>
                      <img
                        className="thumb thumbFill"
                        src={`${API_BASE_URL}${item.thumbnailUrl}`}
                        alt={item.title}
                      />
                      <span className="profileStripHeart" aria-hidden>
                        ♥
                      </span>
                    </div>
                    <div className="galleryHCBody">
                      <strong className="imageCardTitle">{item.title}</strong>
                      <div className="profileStripDate muted">${item.price}</div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </section>

      <AppBottomNav />
    </main>
  );
}
