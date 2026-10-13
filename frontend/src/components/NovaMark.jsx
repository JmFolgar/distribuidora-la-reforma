/** Icono hexagonal del logo (versión compacta). */
export default function NovaMark({ size = 36, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="120" height="120" rx="28" fill="#4F46E5" />
      <polygon
        points="60,22 92.9,41 92.9,79 60,98 27.1,79 27.1,41"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M60 40 L65 55 L80 60 L65 65 L60 80 L55 65 L40 60 L55 55 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
