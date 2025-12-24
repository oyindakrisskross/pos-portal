// src/components/SideBarItem.tsx

interface SidebarItemProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  sidebarOpen: boolean;
  onClick: () => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({
  label,
  icon,
  active,
  sidebarOpen,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md cursor-pointer mx-auto flex w-9/10 items-center gap-3 px-4 py-2 text-sm transition-all duration-300 ${
        active ? "bg-kk-acc text-white" : "text-kk-pri-text hover:bg-kk-acc/80 hover:text-kk-sec-bg"
      } ${sidebarOpen ? "" : "justify-center"}`}
    >
      <span className="text-lg">{icon}</span>
      {sidebarOpen && <span>{label}</span>}
    </button>
  );
};