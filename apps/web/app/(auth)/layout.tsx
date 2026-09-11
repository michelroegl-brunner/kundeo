export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-page p-6 font-sans">
      {children}
    </div>
  );
}
