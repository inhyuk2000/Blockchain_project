import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { API_BASE_URL, apiRequest } from "./api";
import {
  clearAccessToken,
  clearRefreshToken,
  getAccessToken,
  loginWithMetaMask,
} from "./auth";

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
  const [tab, setTab] = useState("gallery");
  const [me, setMe] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: "", email: "" });
  const [profilePending, setProfilePending] = useState(false);
  const [images, setImages] = useState([]);
  const [imagesPending, setImagesPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    image: null,
    title: "",
    description: "",
    price: "",
    category: "",
    deviceId: "",
    capturedAt: "",
  });
  const [log, setLog] = useState("앱 시작: Gallery 탭에서 이미지 목록을 확인하세요.");
  const navigate = useNavigate();
  const token = getAccessToken();

  const writeLog = (value) => setLog(typeof value === "string" ? value : JSON.stringify(value, null, 2));

  const loadMe = async () => {
    try {
      setProfilePending(true);
      const data = await apiRequest("/users/me", { token });
      setMe(data);
      setProfileForm({
        name: data.name ?? "",
        email: data.email ?? "",
      });
      writeLog(data);
    } catch (error) {
      writeLog(error.message);
    } finally {
      setProfilePending(false);
    }
  };

  const loadImages = async () => {
    try {
      setImagesPending(true);
      const data = await apiRequest("/images");
      setImages(data.images ?? []);
    } catch (error) {
      writeLog(error.message);
    } finally {
      setImagesPending(false);
    }
  };

  const saveProfile = async () => {
    try {
      setProfilePending(true);
      const data = await apiRequest("/users/profile", {
        method: "PATCH",
        token,
        body: {
          name: profileForm.name,
          email: profileForm.email,
        },
      });
      setMe(data);
      writeLog(data);
    } catch (error) {
      writeLog(error.message);
    } finally {
      setProfilePending(false);
    }
  };

  useEffect(() => {
    if (tab === "profile" && token) {
      loadMe();
    }
  }, [tab, token]);

  useEffect(() => {
    if (tab === "gallery") {
      loadImages();
    }
  }, [tab]);

  const uploadImage = async () => {
    try {
      if (!uploadForm.image || !uploadForm.title || !uploadForm.price || !uploadForm.category) {
        writeLog("image, title, price, category는 필수입니다.");
        return;
      }
      setUploadPending(true);
      const formData = new FormData();
      formData.append("image", uploadForm.image);
      formData.append("title", uploadForm.title);
      formData.append("description", uploadForm.description);
      formData.append("price", uploadForm.price);
      formData.append("category", uploadForm.category);
      if (uploadForm.deviceId) formData.append("deviceId", uploadForm.deviceId);
      if (uploadForm.capturedAt) {
        formData.append("capturedAt", new Date(uploadForm.capturedAt).toISOString());
      }

      const created = await apiRequest("/images", {
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
      writeLog(created);
      await loadImages();
      setTab("gallery");
    } catch (error) {
      writeLog(error.message);
    } finally {
      setUploadPending(false);
    }
  };

  const logout = () => {
    clearAccessToken();
    clearRefreshToken();
    navigate("/login", { replace: true });
  };

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
        {tab === "gallery" && (
          <section className="panel">
            <h2>Gallery</h2>
            <p className="muted">이미지 업로드 후 아래 리스트에 표시됩니다.</p>
            {imagesPending ? (
              <div className="uploadBox">Loading images...</div>
            ) : images.length === 0 ? (
              <div className="uploadBox">등록된 이미지가 없습니다.</div>
            ) : (
              <div className="imageGrid">
                {images.map((image) => (
                  <article key={image.id} className="imageCard">
                    <img className="thumb" src={`${API_BASE_URL}${image.thumbnailUrl}`} alt={image.title} />
                    <strong>{image.title}</strong>
                    <span>{image.category}</span>
                    <span>${image.price}</span>
                    <span>{image.verificationStatus}</span>
                  </article>
                ))}
              </div>
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

        {tab === "profile" && (
          <section className="panel">
            <h2>Profile</h2>
            <div className="avatarPlaceholder" />
            <label>
              Name
              <input
                value={profileForm.name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                value={profileForm.email}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </label>
            <button className="outlineBtn" onClick={saveProfile} disabled={profilePending}>
              {profilePending ? "Saving..." : "Save Profile"}
            </button>
            <button className="primary" onClick={logout}>
              Logout
            </button>
            <button className="dangerBtn" onClick={() => writeLog("Delete Account API는 다음 단계에서 연결 예정입니다.")}>
              Delete Account
            </button>
            {me && <pre className="jsonBlock">{JSON.stringify(me, null, 2)}</pre>}
          </section>
        )}

        {tab === "log" && (
          <section className="panel">
            <h2>API Log</h2>
            <pre className="jsonBlock">{log}</pre>
          </section>
        )}
      </section>

      <nav className="bottomNav">
        <button className={tab === "gallery" ? "active" : ""} onClick={() => setTab("gallery")}>Home</button>
        <button className={tab === "upload" ? "active" : ""} onClick={() => setTab("upload")}>Upload</button>
        <button className={tab === "log" ? "active" : ""} onClick={() => setTab("log")}>Activity</button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button>
      </nav>
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
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
