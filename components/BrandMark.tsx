/** The Autoura mark: the layered glyph on the forest-green tile (as on /login). */
export default function BrandMark({ size = 64 }: { size?: number }) {
  const glyph = Math.round(size / 2)
  return (
    <div
      className="inline-flex items-center justify-center bg-[#263A29] rounded-2xl"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" />
        <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
