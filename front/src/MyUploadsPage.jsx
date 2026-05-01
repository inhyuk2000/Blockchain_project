import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, API_BASE_URL, apiRequest } from "./api";
import { getAccessToken } from "./auth";
import AppBottomNav from "./AppBottomNav";

const PAGE_SIZE = 20;

const FILTERS = [
  { id: "ALL", label: "전체" },
  { id: "VERIFIED", label: "VERIFIED" },
  { id: "PENDING", label: "PENDING" },
];

function formatUploadedDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

export default function MyUploadsPage() {
  const navigate = useNavigate();
  const token = getAccessToken();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [filterIdx, setFilterIdx] = useState(0);

  const fetchPage = useCallback(
    async (pageToLoad, append) => {
      const qs = new URLSearchParams({ page: String(pageToLoad), size: String(PAGE_SIZE) });
      const list = await apiRequest(`/users/me/images?${qs}`, { token });
      if (!Array.isArray(list)) throw new Error("Unexpected response");
      if (append) {
        setItems((prev) => [...prev, ...list]);
      } else {
        setItems(list);
      }
      setPage(pageToLoad);
      setHasMore(list.length >= PAGE_SIZE);
    },
    [token]
  );

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
        await fetchPage(0, false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "불러오지 못했습니다.");
          setItems([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate, fetchPage]);

  const cycleFilter = () => {
    setFilterIdx((i) => (i + 1) % FILTERS.length);
  };

  const filterSpec = FILTERS[filterIdx];

  const visibleItems = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return items.filter((row) => {
      if (filterSpec.id !== "ALL" && String(row.verificationStatus).toUpperCase() !== filterSpec.id) {
        return false;
      }
      if (q && !String(row.title).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, searchQ, filterSpec.id]);

  const applySearch = (e) => {
    e.preventDefault();
    setSearchQ(searchDraft.trim());
  };

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      await fetchPage(page + 1, true);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  const mePending = pending && items.length === 0;

  return (
    <main className="appShell">
      <header className="detailTopBar">
        <button type="button" className="iconBtn" onClick={() => navigate("/profile")} aria-label="뒤로">
          ←
        </button>
        <h1 className="detailTopTitle">My Uploads</h1>
        <span className="iconBtn ghostIcon" aria-hidden />
      </header>

      <section className="contentArea myUploadsPage">
        <div className="profileHeroRow myUploadsHeaderRow">
          <div className="avatarPlaceholder profileAvatarSm" />
          <div className="profileHeroText">
            <div className="profileDisplayName">내 업로드</div>
            <div className="profileEmail muted">업로드한 작품만 표시됩니다.</div>
          </div>
        </div>

        <form className="myUploadsSearchRow" onSubmit={applySearch}>
          <input
            type="search"
            className="myUploadsSearchInput"
            placeholder="Search my uploads"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            aria-label="내 업로드 검색"
          />
          <button type="button" className="primary myUploadsFilterBtn" onClick={cycleFilter}>
            Filter: {filterSpec.label}
          </button>
        </form>

        {mePending && <div className="uploadBox">불러오는 중...</div>}
        {error && <p className="errorText">{error}</p>}

        {!mePending && visibleItems.length === 0 && (
          <div className="uploadBox">표시할 이미지가 없습니다.</div>
        )}

        {!mePending && visibleItems.length > 0 && (
          <div className="imageGrid myUploadsGrid">
            {visibleItems.map((img) => (
              <article
                key={img.id}
                className="imageCard clickableCard myUploadCard"
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
                  <span className="galleryCardCat">{img.verificationStatus}</span>
                  {img.isSold && <span className="soldBadge">SOLD</span>}
                  <img className="thumb" src={`${API_BASE_URL}${img.thumbnailUrl}`} alt={img.title} />
                </div>
                <div className="imageCardBody">
                  <strong className="imageCardTitle">{img.title}</strong>
                  <div className="myUploadPrice">$ {img.price}</div>
                  <div className="profileStripDate muted">Uploaded on {formatUploadedDate(img.createdAt)}</div>
                </div>
              </article>
            ))}
          </div>
        )}

        {hasMore && !mePending && (
          <button type="button" className="outlineBtn loadMoreBtn" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </section>

      <AppBottomNav />
    </main>
  );
}
