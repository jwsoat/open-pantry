import Link from "next/link";

export default function InventoryTabs({ active }: { active: "pantry" | "list" }) {
  const tabs = [
    { key: "pantry", label: "Pantry & expiry", href: "/" },
    { key: "list", label: "Shopping list", href: "/shopping-list" },
  ] as const;

  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
