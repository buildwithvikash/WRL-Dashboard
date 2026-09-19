import { useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { assets, baseURL } from "../assets/assets";
import { Link, useNavigate } from "react-router-dom";
import { FiLogOut, FiKey, FiChevronDown } from "react-icons/fi";
import axios from "axios";
import { logoutUser } from "../redux/slices/authSlice.js";
import toast from "react-hot-toast";
import ChangePasswordModal from "./ChangePasswordModal.jsx";

const NavBar = () => {
  const { user } = useSelector((store) => store.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => { setPhotoFailed(false); }, [user?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await axios.post(`${baseURL}auth/logout`, {}, { withCredentials: true });
      dispatch(logoutUser());
      toast.success("Logout Successfully");
      navigate("/login");
    } catch (error) {
      console.error("Logout failed", error);
      toast.error("Logout failed. Please try again.");
    }
  };

  // The server caches this image for an hour (Cache-Control: private), keyed by
  // URL — so the URL must differ per user, otherwise logging in as someone else
  // in the same browser keeps showing the previous user's photo.
  const photoUrl = `${baseURL}auth/my-photo?u=${encodeURIComponent(user?.id ?? "")}`;

  return (
    <nav className="sticky top-0 z-50 bg-white h-16 flex items-center px-4 shadow-sm border-b border-gray-200">
      <div className="w-full flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <img
            src={assets.logo}
            alt="Western Logo"
            className="h-10 w-auto mr-3"
          />
          <h1 className="text-xl md:text-2xl font-bold text-blue-800 tracking-wide hidden sm:block">
            Western Refrigeration Pvt.Ltd
          </h1>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 md:gap-3 pl-1 pr-2 py-1 rounded-full hover:bg-gray-50 transition-colors cursor-pointer"
          >
            {user?.id && !photoFailed ? (
              <img
                src={photoUrl}
                alt={user.name}
                onError={() => setPhotoFailed(true)}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover object-top bg-gray-100 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-700 rounded-full flex items-center justify-center text-lg md:text-xl font-bold text-white flex-shrink-0">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            )}
            <div className="hidden sm:block text-left">
              <div className="text-black font-semibold font-playfair text-sm md:text-base leading-tight">
                {user.name}
              </div>
              <div
                className={`${
                  user.roleName === "admin" ? "text-red-500" : "text-gray-400"
                } text-xs md:text-sm leading-tight`}
              >
                {user.roleName}
              </div>
            </div>
            <FiChevronDown className={`text-gray-400 transition-transform hidden sm:block ${menuOpen ? "rotate-180" : ""}`} size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
              <div className="p-4 flex items-center gap-3 border-b border-gray-100">
                {user?.id && !photoFailed ? (
                  <img
                    src={photoUrl}
                    alt={user.name}
                    onError={() => setPhotoFailed(true)}
                    className="w-14 h-14 rounded-full object-cover object-top bg-gray-100 flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 bg-gray-700 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
                    {user?.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                  <p className={`text-xs ${user.roleName === "admin" ? "text-red-500" : "text-gray-400"}`}>
                    {user.roleName}
                  </p>
                </div>
              </div>

              <button
                onClick={() => { setShowChangePassword(true); setMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <FiKey size={16} className="text-gray-400" /> Change Password
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <FiLogOut size={16} /> Logout
              </button>
            </div>
          )}
        </div>

        {showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        )}
      </div>
    </nav>
  );
};

export default NavBar;
