// The default pictures: a line drawing of each place, in the agency's own
// colours (--brand-primary / --brand-accent on --brand-surface), for a tour
// or destination with no photo of its own (lib/photos.ts defaultPicture).
// Drawn to sit on the ground line at the bottom, so any crop keeps the place
// in view. A Picture is either this or a photo — never an empty box.

import type { ArtKey, Picture } from '../../lib/photos'
import a from './art.module.css'

/* eslint-disable @next/next/no-img-element -- agency storage; sized by CSS */

// The sky, ground and water run far past the frame, so a drawing fitted
// into a wide box (fit="contain") still fills it edge to edge.
const GROUND = <path className={a.line} d="M-1000 236H1400" />

const SCENES: Record<ArtKey, React.ReactNode> = {
  'step-pyramid': (
    <>
      <path className={a.mass} d="M96 236V214H110V192H124V170H138V148H152V126H166V104H234V126H248V148H262V170H276V192H290V214H304V236Z" />
      <path className={a.shade} d="M234 104V126H248V148H262V170H276V192H290V214H304V236H252Z" />
      <path className={a.line} d="M110 214H290M124 192H276M138 170H262M152 148H248M166 126H234" />
      <path className={a.line} d="M14 236V222H70V236M22 222V212H62V222M330 236V224H388V236" />
    </>
  ),
  giza: (
    <>
      <path className={a.mass} d="M196 236L282 150L368 236Z" />
      <path className={a.shade} d="M282 150L368 236H300Z" />
      <path className={a.mass} d="M48 236L164 104L280 236Z" />
      <path className={a.shade} d="M164 104L280 236H196Z" />
      <path className={a.mass} d="M318 236L346 206L374 236Z" />
      <path className={a.line} d="M120 154H208M92 186H236" />
    </>
  ),
  sphinx: (
    <>
      <path className={a.mass} d="M24 220L94 150L164 220Z" />
      <path className={a.shade} d="M94 150L164 220H118Z" />
      <path className={a.mass} d="M70 236V202Q72 186 94 184L214 180L224 176L228 140Q232 116 250 114Q268 116 272 140L276 176L268 186L270 206L334 208V236Z" />
      <path className={a.line} d="M232 150H268M230 166H270M250 132V146M244 176Q250 182 256 176M120 236V214M200 236V212" />
      <path className={a.shade} d="M268 186L270 206L334 208V236H300V214Z" />
    </>
  ),
  'abu-simbel': (
    <>
      <path className={a.mass} d="M40 236L58 70H342L360 236Z" />
      {[104, 160, 240, 296].map(x => (
        <g key={x}>
          <path className={a.shade} d={`M${x - 14} 84H${x + 14}V108H${x - 14}Z`} />
          <circle className={a.mass} cx={x} cy={122} r={12} />
          <path className={a.mass} d={`M${x - 24} 146H${x + 24}L${x + 20} 196H${x - 20}Z`} />
          <path className={a.line} d={`M${x - 20} 196V236M${x + 20} 196V236M${x - 26} 214H${x + 26}`} />
        </g>
      ))}
      <path className={a.shade} d="M190 236V196H210V236Z" />
      <path className={a.line} d="M58 78H342" />
    </>
  ),
  valley: (
    <>
      <path className={a.mass} d="M-1000 236V200H0L56 176L104 186L168 104L222 160L262 146L320 170L400 156H1400V236Z" />
      <path className={a.shade} d="M168 104L222 160L262 146L320 170L400 156V236H200Z" />
      <path className={a.line} d="M40 206L96 198L150 210M228 196L300 188L370 200" />
      <path className={a.mass} d="M142 236V212H164V236ZM282 236V218H298V236Z" />
    </>
  ),
  karnak: (
    <>
      <path className={a.mass} d="M58 78H322V96H58Z" />
      {[80, 146, 212, 278].map(x => (
        <g key={x}>
          <path className={a.mass} d={`M${x} 236V120Q${x - 6} 106 ${x - 10} 96H${x + 34}Q${x + 30} 106 ${x + 24} 120V236Z`} />
          <path className={a.line} d={`M${x} 124H${x + 24}M${x} 132H${x + 24}M${x + 12} 150V212`} />
        </g>
      ))}
      <path className={a.mass} d="M344 236L349 92L356 76L363 92L368 236Z" />
      <path className={a.shade} d="M356 76L363 92L368 236H356Z" />
    </>
  ),
  temple: (
    <>
      <path className={a.mass} d="M48 236L68 98H176L186 236Z" />
      <path className={a.mass} d="M214 236L224 98H332L352 236Z" />
      <path className={a.shade} d="M176 98L186 236H160Z" />
      <path className={a.shade} d="M332 98L352 236H326Z" />
      <path className={a.mass} d="M176 236V142H224V236Z" />
      <path className={a.shade} d="M188 236V172H212V236Z" />
      <path className={a.line} d="M66 110H178M222 110H334M176 152H224M96 98V236M128 98V236M272 98V236M304 98V236" />
    </>
  ),
  museum: (
    <>
      <path className={a.mass} d="M60 228V128H340V228Z" />
      <path className={a.mass} d="M146 228V96H254V228Z" />
      <path className={a.shade} d="M178 228V172A22 22 0 0 1 222 172V228Z" />
      <path className={a.line} d="M60 140H340M146 108H254M136 96H264" />
      {[84, 112, 288, 316].map(x => <path key={x} className={a.shade} d={`M${x - 8} 160H${x + 8}V200H${x - 8}Z`} />)}
      <path className={a.line} d="M40 228H360M30 236H370" />
    </>
  ),
  cairo: (
    <>
      <path className={a.mass} d="M20 236V196H86V236ZM300 236V186H380V236Z" />
      <path className={a.mass} d="M136 236V170H250V236Z" />
      <path className={a.mass} d="M146 170Q193 102 240 170Z" />
      <path className={a.line} d="M193 136V120" />
      <circle className={a.mass} cx="193" cy="116" r="3.5" />
      <path className={a.mass} d="M100 236V96H114V236Z" />
      <path className={a.mass} d="M100 96L107 70L114 96Z" />
      <path className={a.line} d="M96 130H118M96 164H118" />
      <path className={a.mass} d="M270 236V112H282V236Z" />
      <path className={a.mass} d="M270 112L276 90L282 112Z" />
      <path className={a.line} d="M266 142H286M266 176H286" />
      <path className={a.shade} d="M182 236V206A11 11 0 0 1 204 206V236Z" />
    </>
  ),
  nile: (
    <>
      <path className={a.water} d="M-1000 214H1400V1300H-1000Z" />
      <path className={a.line} d="M30 236Q50 230 70 236T110 236M250 254Q270 248 290 254T330 254M120 270Q140 264 160 270T200 270" />
      <path className={a.line} d="M56 214Q60 180 52 150M52 150Q36 146 28 158M52 150Q66 140 78 150M52 150Q44 134 32 136M52 150Q64 132 74 134" />
      <path className={a.line} d="M346 214Q350 186 344 162M344 162Q330 158 324 168M344 162Q356 154 366 162M344 162Q338 148 328 150M344 162Q354 146 362 148" />
      <path className={a.mass} d="M206 66L294 188L210 192Z" />
      <path className={a.line} d="M204 206V60" />
      <path className={a.mass} d="M128 202Q206 228 292 202L284 196H136Z" />
    </>
  ),
  desert: (
    <>
      <path className={a.shade} d="M-1000 236H0Q90 196 190 222T400 210L1400 210V1300H-1000Z" />
      <path className={a.mass} d="M146 226Q158 204 154 190Q136 184 142 166Q168 140 200 160Q216 176 190 188Q184 206 196 226Z" />
      <path className={a.mass} d="M262 220Q270 206 266 196Q254 192 258 182Q276 168 296 182Q304 192 288 198Q284 210 292 220Z" />
      <path className={a.line} d="M40 254Q120 240 200 252M220 266Q300 252 380 262" />
    </>
  ),
  sea: (
    <>
      <path className={a.mass} d="M-1000 190H0L56 144L104 172L166 118L236 178L298 150L400 190H1400Z" />
      <path className={a.shade} d="M166 118L236 178L298 150L400 190H200Z" />
      <path className={a.water} d="M-1000 190H1400V1300H-1000Z" />
      <path className={a.line} d="M24 214Q44 208 64 214T104 214M180 232Q200 226 220 232T260 232M300 212Q320 206 340 212T380 212M90 256Q110 250 130 256T170 256" />
    </>
  ),
  alexandria: (
    <>
      <path className={a.water} d="M-1000 216H1400V1300H-1000Z" />
      <path className={a.mass} d="M96 216V150H304V216Z" />
      <path className={a.mass} d="M160 150V102H240V150Z" />
      <path className={a.mass} d="M84 216V136H112V216ZM288 216V136H316V216Z" />
      <path className={a.line} d="M160 102V94H172V102M184 102V94H196V102M204 102V94H216V102M228 102V94H240V102M84 136V128H92V136M104 136V128H112V136M288 136V128H296V136M308 136V128H316V136" />
      <path className={a.shade} d="M190 216V186A10 10 0 0 1 210 186V216Z" />
      <path className={a.line} d="M40 240Q60 234 80 240T120 240M240 258Q260 252 280 258T320 258" />
    </>
  ),
}

/** A drawing of a place, filling its box. Decorative when the box is a link
 *  with its own words; otherwise it carries the place's name. */
export function SiteArt({ art, alt, className, fit = 'cover' }: { art: ArtKey; alt?: string; className?: string; fit?: 'cover' | 'contain' }) {
  return (
    <svg viewBox="0 12 400 262" preserveAspectRatio={fit === 'contain' ? 'xMidYMax meet' : 'xMidYMax slice'} className={`${a.art} ${className ?? ''}`}
      role={alt ? 'img' : undefined} aria-label={alt} aria-hidden={alt ? undefined : true}>
      <rect className={a.bg} x="-1000" y="-1000" width="2400" height="2400" />
      <circle className={a.sun} cx="318" cy="64" r="26" />
      {SCENES[art]}
      {art !== 'nile' && art !== 'sea' && art !== 'alexandria' && GROUND}
    </svg>
  )
}

/** A photo, or the default drawing in its place. */
export function PictureView({ picture, className, eager, decorative, fit }: { picture: Picture; className?: string; eager?: boolean; decorative?: boolean; fit?: 'cover' | 'contain' }) {
  if (picture.kind === 'art') return <SiteArt art={picture.art} alt={decorative ? undefined : picture.alt} className={className} fit={fit} />
  return <img src={picture.src} alt={decorative ? '' : picture.alt} className={className} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" />
}
