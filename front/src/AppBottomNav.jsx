import { useNavigate, useLocation } from "react-router-dom";

/** 하단 탭. `/home`일 때만 homeTab으로 Home/Upload/Gallery 활성; `/profile/*`에서는 Profile 활성 */
export default function AppBottomNav({ homeTab }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const profileActive = pathname.startsWith("/profile") || pathname === "/verify";
  const onHomeShell = pathname === "/home";

  return (
    <nav className="bottomNav">
      <button
        type="button"
        className={onHomeShell && !profileActive && homeTab === "home" ? "active" : ""}
        onClick={() => navigate("/home", { state: { tab: "home" } })}
      >
        Home
      </button>
      <button
        type="button"
        className={onHomeShell && !profileActive && homeTab === "upload" ? "active" : ""}
        onClick={() => navigate("/home", { state: { tab: "upload" } })}
      >
        Upload
      </button>
      <button
        type="button"
        className={onHomeShell && !profileActive && homeTab === "gallery" ? "active" : ""}
        onClick={() => navigate("/home", { state: { tab: "gallery" } })}
      >
        Gallery
      </button>
      <button type="button" className={profileActive ? "active" : ""} onClick={() => navigate("/profile")}>
        Profile
      </button>
    </nav>
  );
}
