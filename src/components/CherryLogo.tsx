// Brand logo (public/logo.svg, mirrored from the marketing site). The email
// templates keep the PNG mark for email-client support.
export default function CherryLogo({ className = 'h-10 w-10' }: { className?: string }) {
  return <img src="/logo.svg" alt="Have Another Cherry logo" className={`object-contain ${className}`} />;
}
