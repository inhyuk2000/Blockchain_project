import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ApiError, API_BASE_URL, apiRequest } from "./api";
import { computeImageSha256Hex0x } from "./imageHash";
import { registerImageOnChain } from "./registerImageOnChain";
import {
  clearAccessToken,
  clearRefreshToken,
  getAccessToken,
  loginWithMetaMask,
} from "./auth";
import ImageDetailPage from "./ImageDetailPage";
import MyUploadsPage from "./MyUploadsPage";
import ProfileEditPage from "./ProfileEditPage";
import ProfileLandingPage from "./ProfileLandingPage";
import VerifyPage from "./VerifyPage";
import AppBottomNav from "./AppBottomNav";

const HOME_FEED_SIZE = 12;
const GALLERY_STRIP_SIZE = 30;
const GALLERY_SEARCH_SIZE = 20;

function buildSearchQs({ keyword = "", category = "", page = 0, size = GALLERY_SEARCH_SIZE }) {
  const p = new URLSearchParams({ page: String(page), size: String(size) });
  const kw = String(keyword).trim();
  if (kw) p.set("keyword", kw);
  const cat = String(category).trim();
  if (cat) p.set("category", cat);
  return p.toString();
}

function LoginPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    try {
      setPending(true);
      setError("");
      await loginWithMetaMask();
      navigate("/home", { replace: true });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="appShell">
      <section className="contentArea">
        <section className="panel centered">
          <h2>Login</h2>
          <p className="muted">Connect your MetaMask wallet to continue.</p>
          <button className="primary" onClick={handleLogin} disabled={pending}>
            {pending ? "Connecting..." : "Connect MetaMask"}
          </button>
          {error && <p className="errorText">{error}</p>}
        </section>
      </section>
    </main>
  );
}

function HomePage() {
  const [tab, setTab] = useState("home");
  const [favoriteIds, setFavoriteIds] = useState([]);
  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  /** Home 피드 (GET /images) */
  const [homeRecent, setHomeRecent] = useState([]);
  const [homePending, setHomePending] = useState(false);

  /** Gallery 브라우즈 / 검색 */
  const [galleryMode, setGalleryMode] = useState("browse");
  const [browseSections, setBrowseSections] = useState([]);
  const [galleryPending, setGalleryPending] = useState(false);

  const [searchDraftKw, setSearchDraftKw] = useState("");
  const [searchDraftCat, setSearchDraftCat] = useState("");
  const [appliedSearchKw, setAppliedSearchKw] = useState("");
  const [appliedSearchCat, setAppliedSearchCat] = useState("");

  const [searchResultsBare, setSearchResultsBare] = useState([]);
  const [searchPage, setSearchPage] = useState(0);
  const [hasMoreSearch, setHasMoreSearch] = useState(false);

  const [uploadPending, setUploadPending] = useState(false);
  const [favoriteBusyId, setFavoriteBusyId] = useState(null);
  const [uploadForm, setUploadForm] = useState({
    image: null,
    title: "",
    description: "",
    price: "",
    category: "",
    deviceId: "",
    capturedAt: "",
  });

  const navigate = useNavigate();
  const location = useLocation();
  const token = getAccessToken();

  useEffect(() => {
    const t = location.state?.tab;
    if (t === "home" || t === "upload" || t === "gallery") {
      setTab(t);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.tab, location.pathname, navigate]);

  const reloadFavorites = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiRequest(`/users/me/favorites?page=0&size=100`, { token });
      setFavoriteIds(Array.isArray(res) ? res.map((item) => item.id) : []);
    } catch {
      setFavoriteIds([]);
    }
  }, [token]);

  const loadHomeRecent = useCallback(async () => {
    try {
      setHomePending(true);
      if (token) {
        await reloadFavorites();
      } else {
        setFavoriteIds([]);
      }
      const params = new URLSearchParams({
        page: "0",
        size: String(HOME_FEED_SIZE),
        sort: "latest",
      });
      const list = await apiRequest(`/images?${params}`, token ? { token } : {});
      if (!Array.isArray(list)) throw new Error("Unexpected home feed response");
      setHomeRecent(list);
    } catch {
      setHomeRecent([]);
    } finally {
      setHomePending(false);
    }
  }, [token, reloadFavorites]);

  const loadGalleryBrowse = useCallback(async () => {
    try {
      setGalleryPending(true);
      if (token) {
        await reloadFavorites();
      } else {
        setFavoriteIds([]);
      }
      const categories = await apiRequest("/images/categories", token ? { token } : {});
      const catList = Array.isArray(categories) ? categories : [];

      if (catList.length === 0) {
        const qs = buildSearchQs({ page: 0, size: 40 });
        const list = await apiRequest(`/images/search?${qs}`, token ? { token } : {});
        setBrowseSections([{ category: "All", items: Array.isArray(list) ? list : [] }]);
        return;
      }

      const sections = [];
      for (const cat of catList) {
        const qs = buildSearchQs({ category: cat, page: 0, size: GALLERY_STRIP_SIZE });
        const list = await apiRequest(`/images/search?${qs}`, token ? { token } : {});
        sections.push({ category: cat, items: Array.isArray(list) ? list : [] });
      }
      setBrowseSections(sections);
    } catch {
      setBrowseSections([]);
    } finally {
      setGalleryPending(false);
    }
  }, [token, reloadFavorites]);

  const fetchSearch = useCallback(
    async (keyword, category, pageToLoad, append) => {
      try {
        setGalleryPending(true);
        if (token) {
          await reloadFavorites();
        }
        const qs = buildSearchQs({
          keyword,
          category,
          page: pageToLoad,
          size: GALLERY_SEARCH_SIZE,
        });
        const list = await apiRequest(`/images/search?${qs}`, token ? { token } : {});
        if (!Array.isArray(list)) throw new Error("검색 응답 형식 오류");
        if (append) {
          setSearchResultsBare((prev) => [...prev, ...list]);
        } else {
          setSearchResultsBare(list);
        }
        setSearchPage(pageToLoad);
        setHasMoreSearch(list.length >= GALLERY_SEARCH_SIZE);
      } catch {
        if (!append) setSearchResultsBare([]);
        setHasMoreSearch(false);
      } finally {
        setGalleryPending(false);
      }
    },
    [token, reloadFavorites]
  );

  useEffect(() => {
    if (tab === "home") {
      loadHomeRecent();
    }
  }, [tab, loadHomeRecent]);

  useEffect(() => {
    if (tab !== "gallery") return;
    if (galleryMode === "browse") {
      loadGalleryBrowse();
    }
  }, [tab, galleryMode, loadGalleryBrowse]);

  const toggleFavorite = async (image) => {
    if (!token) return;
    try {
      setFavoriteBusyId(image.id);
      if (favSet.has(image.id)) {
        await apiRequest(`/images/${image.id}/favorite`, { method: "DELETE", token });
        setFavoriteIds((prev) => prev.filter((x) => x !== image.id));
      } else {
        await apiRequest(`/images/${image.id}/favorite`, { method: "POST", token });
        setFavoriteIds((prev) => [...new Set([...prev, image.id])]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && !favSet.has(image.id)) {
        setFavoriteIds((prev) => [...new Set([...prev, image.id])]);
        return;
      }
      if (err instanceof ApiError && err.status === 404 && favSet.has(image.id)) {
        setFavoriteIds((prev) => prev.filter((x) => x !== image.id));
      }
    } finally {
      setFavoriteBusyId(null);
    }
  };

  const submitGallerySearch = async (e) => {
    e.preventDefault();
    const kw = searchDraftKw.trim();
    const cat = searchDraftCat.trim();
    setAppliedSearchKw(kw);
    setAppliedSearchCat(cat);
    setGalleryMode("search");
    await fetchSearch(kw, cat, 0, false);
  };

  const clearGallerySearch = async () => {
    setSearchDraftKw("");
    setSearchDraftCat("");
    setAppliedSearchKw("");
    setAppliedSearchCat("");
    setSearchResultsBare([]);
    setGalleryMode("browse");
    await loadGalleryBrowse();
  };

  const uploadImage = async () => {
    try {
      if (!uploadForm.image || !uploadForm.title || !uploadForm.price || !uploadForm.category) {
        return;
      }
      setUploadPending(true);
      const file = uploadForm.image;
      const roundedPrice = Math.round(Number(uploadForm.price));
      const capturedIso = uploadForm.capturedAt
        ? new Date(uploadForm.capturedAt).toISOString()
        : "";

      const imageHash = await computeImageSha256Hex0x(file);
      const metadata = JSON.stringify({
        title: String(uploadForm.title),
        description: uploadForm.description ? String(uploadForm.description) : "",
        price: roundedPrice,
        category: String(uploadForm.category),
        deviceId: uploadForm.deviceId ? String(uploadForm.deviceId) : "",
        capturedAt: capturedIso,
      });

      const { txHash, verificationStatus, blockNumber } = await registerImageOnChain({
        imageHash,
        price: roundedPrice,
        metadata,
      });

      const formData = new FormData();
      formData.append("image", file);
      formData.append("title", uploadForm.title);
      formData.append("description", uploadForm.description);
      formData.append("price", String(uploadForm.price));
      formData.append("category", uploadForm.category);
      formData.append("imageHash", imageHash);
      formData.append("txHash", txHash);
      formData.append("verificationStatus", verificationStatus);
      if (uploadForm.deviceId) formData.append("deviceId", uploadForm.deviceId);
      if (uploadForm.capturedAt) {
        formData.append("capturedAt", capturedIso);
      }
      if (blockNumber != null && Number.isFinite(blockNumber)) {
        formData.append("blockNumber", String(blockNumber));
      }

      await apiRequest("/images", {
        method: "POST",
        token,
        body: formData,
      });
      setUploadForm({
        image: null,
        title: "",
        description: "",
        price: "",
        category: "",
        deviceId: "",
        capturedAt: "",
      });
      await loadHomeRecent();
      await loadGalleryBrowse();
      if (galleryMode === "search") {
        await fetchSearch(appliedSearchKw, appliedSearchCat, 0, false);
      }
      setTab("gallery");
    } catch {
      /* apiRequest 실패 무시 · 필요 시 메시지 추가 */
    } finally {
      setUploadPending(false);
    }
  };

  const logout = () => {
    clearAccessToken();
    clearRefreshToken();
    navigate("/login", { replace: true });
  };

  const renderGalleryCard = (image) => (
    <article
      key={`g-${image.id}`}
      className="galleryHCard clickableCard"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/images/${image.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/images/${image.id}`);
        }
      }}
    >
      <div className="imageCardVisual">
        <img
          className="thumb thumbFill"
          src={`${API_BASE_URL}${image.thumbnailUrl}`}
          alt={image.title}
        />
        <span className="galleryCardCat">{image.verificationStatus}</span>
      </div>
      <div className="galleryHCBody">
        <strong className="imageCardTitle">{image.title}</strong>
        <div className="galleryHCFooter">
          <button
            type="button"
            className={`heartBtn ${favSet.has(image.id) ? "heartBtnActive" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(image);
            }}
            disabled={favoriteBusyId === image.id}
            title={favSet.has(image.id) ? "찜 해제" : "찜하기"}
            aria-pressed={favSet.has(image.id)}
          >
            {favoriteBusyId === image.id ? "…" : "♥"}
          </button>
          <span className="imagePriceTag">${image.price}</span>
        </div>
      </div>
    </article>
  );

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <h1>BLOCK PHOTO</h1>
          <p>Prototype for backend integration</p>
        </div>
        <div className="topBarActions">
          <span className="badge">{token ? "Signed In" : "Guest"}</span>
          <button className="miniBtn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <section className="contentArea">
        {tab === "home" && (
          <section className="panel homeFeed">
            <h2 className="galleryHeroTitle">Home</h2>
            <div className="carouselMock">
              <p>Swipe through your uploaded images.</p>
              <div className="carouselDots">
                <span /><span /><span /><span />
              </div>
            </div>

            <h3 className="stripHeading">Latest</h3>
            <div className="hStrip">
              {homePending && homeRecent.length === 0 ? (
                <span className="muted">불러오는 중...</span>
              ) : homeRecent.length === 0 ? (
                <span className="muted">등록된 이미지가 없습니다.</span>
              ) : (
                homeRecent.map((image) => {
                  const merged = image;
                  return (
                    <article
                      key={`h-${merged.id}`}
                      className="homeMiniCard clickableCard"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/images/${merged.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/images/${merged.id}`);
                        }
                      }}
                    >
                      <img src={`${API_BASE_URL}${merged.thumbnailUrl}`} alt={merged.title} />
                      <div className="homeMiniMeta">
                        <span className="homeMiniTitle">{merged.title}</span>
                        <button
                          type="button"
                          className={`heartBtn heartBtnSmall ${favSet.has(merged.id) ? "heartBtnActive" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(merged);
                          }}
                          disabled={favoriteBusyId === merged.id}
                        >
                          ♥
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        )}

        {tab === "gallery" && (
          <section className="panel galleryPage">
            <h2 className="galleryHeroTitle">Gallery</h2>

            <form className="gallerySearchBar" onSubmit={submitGallerySearch}>
              <input
                type="search"
                placeholder="키워드 (제목·설명)"
                value={searchDraftKw}
                onChange={(e) => setSearchDraftKw(e.target.value)}
                aria-label="검색 키워드"
              />
              <input
                type="text"
                placeholder="카테고리 (예: LANDSCAPE)"
                value={searchDraftCat}
                onChange={(e) => setSearchDraftCat(e.target.value)}
                aria-label="카테고리"
              />
              <div className="gallerySearchActions">
                <button type="submit" className="primary" disabled={galleryPending}>
                  검색
                </button>
                <button
                  type="button"
                  className="outlineBtn"
                  onClick={clearGallerySearch}
                  disabled={galleryPending}
                >
                  초기화
                </button>
              </div>
            </form>

            {galleryMode === "browse" && (
              <>
                {galleryPending && browseSections.length === 0 ? (
                  <div className="uploadBox">Loading gallery...</div>
                ) : (
                  browseSections.map((section) => (
                    <div key={section.category} className="categoryStripBlock">
                      <h3 className="stripHeading">{section.category}</h3>
                      <div className="hStrip hStripTall">
                        {section.items.length === 0 ? (
                          <span className="muted">이미지 없음</span>
                        ) : (
                          section.items.map((img) => renderGalleryCard(img))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {galleryMode === "search" && (
              <>
                <p className="muted">
                  GET /images/search · keyword &amp; category · page {searchPage}
                </p>
                {galleryPending && searchResultsBare.length === 0 ? (
                  <div className="uploadBox">검색 중...</div>
                ) : searchResultsBare.length === 0 ? (
                  <div className="uploadBox">검색 결과가 없습니다.</div>
                ) : (
                  <>
                    <div className="imageGrid">
                      {searchResultsBare.map((img) => (
                        <article
                          key={`s-${img.id}`}
                          className="imageCard clickableCard"
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/images/${img.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(`/images/${img.id}`);
                            }
                          }}
                        >
                          <div className="imageCardVisual">
                            <img
                              className="thumb"
                              src={`${API_BASE_URL}${img.thumbnailUrl}`}
                              alt={img.title}
                            />
                          </div>
                          <div className="imageCardBody">
                            <strong className="imageCardTitle">{img.title}</strong>
                            <span className="imageCardMetaMuted">{img.verificationStatus}</span>
                          </div>
                          <footer className="imageCardFooter">
                            <button
                              type="button"
                              className={`heartBtn ${favSet.has(img.id) ? "heartBtnActive" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(img);
                              }}
                              disabled={favoriteBusyId === img.id}
                            >
                              {favoriteBusyId === img.id ? "…" : "♥"}
                            </button>
                            <span className="imagePriceTag">${img.price}</span>
                          </footer>
                        </article>
                      ))}
                    </div>
                    {hasMoreSearch && (
                      <button
                        type="button"
                        className="outlineBtn loadMoreBtn"
                        disabled={galleryPending}
                        onClick={() =>
                          fetchSearch(appliedSearchKw, appliedSearchCat, searchPage + 1, true)
                        }
                      >
                        {galleryPending ? "Loading…" : "Load more"}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        )}

        {tab === "upload" && (
          <section className="panel">
            <h2>Camera & Upload</h2>
            <label>
              Image File
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setUploadForm((prev) => ({
                    ...prev,
                    image: e.target.files?.[0] ?? null,
                  }))
                }
              />
            </label>
            <label>
              Title
              <input
                value={uploadForm.title}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </label>
            <label>
              Description
              <textarea
                rows={2}
                value={uploadForm.description}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>
            <label>
              Price
              <input
                type="number"
                min="0"
                value={uploadForm.price}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, price: e.target.value }))}
              />
            </label>
            <label>
              Category
              <input
                placeholder="LANDSCAPE"
                value={uploadForm.category}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, category: e.target.value }))}
              />
            </label>
            <label>
              Device ID
              <input
                value={uploadForm.deviceId}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, deviceId: e.target.value }))}
              />
            </label>
            <label>
              Captured At
              <input
                type="datetime-local"
                value={uploadForm.capturedAt}
                onChange={(e) => setUploadForm((prev) => ({ ...prev, capturedAt: e.target.value }))}
              />
            </label>
            <button className="primary" onClick={uploadImage} disabled={uploadPending}>
              {uploadPending ? "Uploading..." : "Save Posting"}
            </button>
          </section>
        )}

      </section>

      <AppBottomNav homeTab={tab} />
    </main>
  );
}

function RequireAuth({ children }) {
  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/home"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile/uploads"
        element={
          <RequireAuth>
            <MyUploadsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile/edit"
        element={
          <RequireAuth>
            <ProfileEditPage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfileLandingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/verify"
        element={
          <RequireAuth>
            <VerifyPage />
          </RequireAuth>
        }
      />
      <Route
        path="/images/:imageId"
        element={
          <RequireAuth>
            <ImageDetailPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
