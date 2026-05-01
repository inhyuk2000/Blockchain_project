import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiRequest } from "./api";
import { clearAccessToken, clearRefreshToken, getAccessToken } from "./auth";
import AppBottomNav from "./AppBottomNav";

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const token = getAccessToken();
  const [form, setForm] = useState({ name: "", email: "", nickname: "" });
  const [pending, setPending] = useState(true);
  const [savePending, setSavePending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        navigate("/login", { replace: true });
        return;
      }
      try {
        setPending(true);
        const data = await apiRequest("/users/me", { token });
        if (!cancelled) {
          setForm({
            name: data.name ?? "",
            email: data.email ?? "",
            nickname: data.nickname ?? "",
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "불러오지 못했습니다.");
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  const save = async () => {
    try {
      setSavePending(true);
      setError("");
      const body = {};
      const name = form.name.trim();
      const email = form.email.trim();
      const nickname = form.nickname.trim();
      if (name) body.name = name;
      if (email) body.email = email;
      if (nickname) body.nickname = nickname;
      if (Object.keys(body).length === 0) {
        setError("이름·이메일·닉네임 중 하나 이상을 입력해 주세요.");
        setSavePending(false);
        return;
      }
      await apiRequest("/users/profile", {
        method: "PATCH",
        token,
        body,
      });
      navigate("/profile");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "저장에 실패했습니다.");
    } finally {
      setSavePending(false);
    }
  };

  const logout = () => {
    clearAccessToken();
    clearRefreshToken();
    navigate("/login", { replace: true });
  };

  return (
    <main className="appShell">
      <header className="detailTopBar">
        <button type="button" className="iconBtn" onClick={() => navigate("/profile")} aria-label="뒤로">
          ←
        </button>
        <h1 className="detailTopTitle">Edit Profile</h1>
        <span className="iconBtn ghostIcon" aria-hidden />
      </header>

      <section className="contentArea">
        {pending && <p className="muted">불러오는 중...</p>}
        {!pending && (
          <section className="panel">
            {error && <p className="errorText">{error}</p>}
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </label>
            <label>
              Nickname
              <input
                value={form.nickname}
                onChange={(e) => setForm((prev) => ({ ...prev, nickname: e.target.value }))}
              />
            </label>
            <button type="button" className="primary" onClick={save} disabled={savePending}>
              {savePending ? "Saving..." : "Save"}
            </button>
            <button type="button" className="outlineBtn" onClick={logout}>
              Logout
            </button>
          </section>
        )}
      </section>

      <AppBottomNav />
    </main>
  );
}
