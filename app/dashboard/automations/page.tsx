"use client";

import {
  ArrowRight,
  ChevronLeft,
  Mail,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function AutomationsPage() {
  const router = useRouter();

  return (
    <main className="automations-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grid-overlay" />

      <div className="page-shell">
        {/* HEADER */}
        <header className="page-header">
          <div className="header-left">
            <button
              className="back-button"
              type="button"
              onClick={() => router.push("/dashboard")}
              aria-label="Back to dashboard"
              title="Back to Dashboard"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="header-copy">
              <span className="eyebrow">DEVILX FLOW</span>

              <div className="title-line">
                <h1>
                  Automations<span>.</span>
                </h1>

                <span className="live-dot">
                  <span />
                  Live
                </span>
              </div>

              <p>
                Build intelligent workflows that automatically respond to
                payments, events, and business conditions.
              </p>
            </div>
          </div>
        </header>

        {/* AUTOMATION SECTION */}
        <section className="automation-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">AUTOMATION SYSTEM</span>
              <h2>Choose a channel</h2>
            </div>

            <div className="system-status">
              <span className="status-pulse" />
              Ready to automate
            </div>
          </div>

          <div className="automation-grid">
            {/* EMAIL */}
            <button
              type="button"
              onClick={() => router.push("/dashboard/automations/email")}
              className="automation-card email-card"
            >
              <div className="card-light" />
              <div className="card-number">01</div>

              <div className="card-top">
                <div className="automation-icon">
                  <Mail size={23} strokeWidth={1.7} />
                </div>

                <div className="card-arrow">
                  <ArrowRight size={17} />
                </div>
              </div>

              <div className="visual-lines">
                <span />
                <span />
                <span />
              </div>

              <div className="card-content">
                <span className="card-kicker">EMAIL</span>

                <h3>Email Automation</h3>

                <p>
                  Trigger personalized emails automatically based on your
                  payment and business rules.
                </p>
              </div>

              <div className="card-footer">
                <span>Open Automation</span>
                <ArrowRight size={15} />
              </div>
            </button>

            {/* WHATSAPP */}
            <button
              type="button"
              onClick={() => router.push("/dashboard/automations/whatsapp")}
              className="automation-card whatsapp-card"
            >
              <div className="card-light" />
              <div className="card-number">02</div>

              <div className="card-top">
                <div className="automation-icon">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="whatsapp-logo"
                  >
                    <path d="M20.52 3.48A11.87 11.87 0 0 0 12.07 0C5.5 0 .16 5.34.16 11.91c0 2.1.55 4.15 1.6 5.96L.06 24l6.28-1.65a11.9 11.9 0 0 0 5.73 1.46h.01c6.57 0 11.91-5.34 11.91-11.91 0-3.18-1.24-6.17-3.47-8.42ZM12.08 21.8h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.73.98 1-3.64-.23-.37a9.9 9.9 0 0 1-1.52-5.27C2.19 6.44 6.63 2 12.08 2c2.64 0 5.12 1.03 6.98 2.9a9.83 9.83 0 0 1 2.89 7c0 5.46-4.44 9.9-9.87 9.9Zm5.43-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.21 5.08 4.5.71.31 1.27.49 1.7.63.71.23 1.35.2 1.86.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
                  </svg>
                </div>

                <div className="card-arrow">
                  <ArrowRight size={17} />
                </div>
              </div>

              <div className="visual-lines">
                <span />
                <span />
                <span />
              </div>

              <div className="card-content">
                <span className="card-kicker">WHATSAPP</span>

                <h3>WhatsApp Automation</h3>

                <p>
                  Trigger WhatsApp messages automatically when payments,
                  events, or conditions occur.
                </p>
              </div>

              <div className="card-footer">
                <span>Open Automation</span>
                <ArrowRight size={15} />
              </div>
            </button>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="page-footer">
          <div>
            <Zap size={11} />
            <span>DEVILX FLOW</span>
          </div>

          <span>AUTOMATION ENGINE</span>
        </footer>
      </div>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(html),
        :global(body) {
          margin: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #050505;
        }

        :global(body) {
          color: #f5f5f5;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .automations-page {
          position: relative;
          width: 100%;
          height: 100vh;
          min-height: 620px;
          overflow: hidden;
          padding: 34px 44px 24px;
          background:
            radial-gradient(
              circle at 9% 0%,
              rgba(239, 35, 53, 0.065),
              transparent 27%
            ),
            radial-gradient(
              circle at 95% 75%,
              rgba(239, 35, 53, 0.025),
              transparent 25%
            ),
            #050505;
        }

        .page-shell {
          position: relative;
          z-index: 2;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .ambient {
          position: fixed;
          pointer-events: none;
          border-radius: 999px;
          filter: blur(110px);
          z-index: 0;
        }

        .ambient-one {
          width: 460px;
          height: 460px;
          top: -280px;
          right: -120px;
          background: rgba(220, 38, 38, 0.075);
          animation: ambientFloat 8s ease-in-out infinite;
        }

        .ambient-two {
          width: 360px;
          height: 360px;
          bottom: -220px;
          left: 28%;
          background: rgba(220, 38, 38, 0.035);
          animation: ambientFloat 11s ease-in-out infinite reverse;
        }

        .grid-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: 0.17;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.025) 1px,
              transparent 1px
            );
          background-size: 55px 55px;
          mask-image: linear-gradient(to bottom, black, transparent 80%);
        }

        /* HEADER */

        .page-header {
          display: flex;
          align-items: flex-start;
          padding-bottom: 26px;
          border-bottom: 1px solid #202023;
          flex-shrink: 0;
          animation: headerIn 0.65s ease both;
        }

        .header-left {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          min-width: 0;
        }

        .back-button {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          margin-top: 1px;
          display: grid;
          place-items: center;
          border: 1px solid #242427;
          border-radius: 9px;
          background: #0a0a0b;
          color: #8b8b93;
          cursor: pointer;
          transition: all 0.22s ease;
        }

        .back-button:hover {
          color: #fff;
          border-color: #3b3b3f;
          background: #101011;
          transform: translateX(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .header-copy {
          min-width: 0;
        }

        .eyebrow {
          display: block;
          color: #707078;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }

        .title-line {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
        }

        .title-line h1 {
          margin: 0;
          color: #fafafa;
          font-size: 38px;
          line-height: 1.1;
          letter-spacing: -0.035em;
          font-weight: 700;
        }

        .title-line h1 span {
          color: #ef2335;
          animation: blink 2s ease-in-out infinite;
        }

        .live-dot {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #4ade80;
          font-size: 14px;
          font-weight: 700;
        }

        .live-dot span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.08);
          animation: pulse 1.8s ease-in-out infinite;
        }

        .header-copy p {
          max-width: 700px;
          margin: 10px 0 0;
          color: #8b8b94;
          font-size: 15px;
          line-height: 1.55;
        }

        /* SECTION */

        .automation-section {
          display: flex;
          flex: 1;
          min-height: 0;
          flex-direction: column;
          padding-top: 25px;
        }

        .section-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 15px;
          flex-shrink: 0;
        }

        .section-kicker {
          display: block;
          color: #707078;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
        }

        .section-heading h2 {
          margin: 5px 0 0;
          color: #f2f2f3;
          font-size: 21px;
          line-height: 1.2;
          font-weight: 700;
          letter-spacing: -0.025em;
        }

        .system-status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #6f6f77;
          font-size: 11px;
        }

        .status-pulse {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.06);
          animation: pulse 1.8s ease-in-out infinite;
        }

        /* CARDS */

        .automation-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          flex: 1;
          min-height: 0;
        }

        .automation-card {
          position: relative;
          min-width: 0;
          min-height: 0;
          height: 100%;
          overflow: hidden;

          display: flex;
          flex-direction: column;

          padding: 27px;

          border: 1px solid #202023;
          border-radius: 12px;

          background: linear-gradient(
            145deg,
            rgba(17, 17, 18, 0.96),
            rgba(8, 8, 9, 0.98)
          );

          color: inherit;
          text-align: left;
          cursor: pointer;

          transition:
            transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1),
            border-color 0.35s ease,
            box-shadow 0.45s ease;
        }

        .automation-card::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.035),
            transparent 40%
          );
          transition: opacity 0.4s ease;
        }

        .automation-card:hover {
          transform: translateY(-5px);
        }

        .automation-card:hover::before {
          opacity: 1;
        }

        .email-card:hover {
          border-color: rgba(239, 35, 53, 0.46);
          box-shadow:
            0 20px 60px rgba(239, 35, 53, 0.11),
            inset 0 1px 0 rgba(239, 68, 68, 0.08);
        }

        .whatsapp-card:hover {
          border-color: rgba(37, 211, 102, 0.42);
          box-shadow:
            0 20px 60px rgba(37, 211, 102, 0.09),
            inset 0 1px 0 rgba(37, 211, 102, 0.07);
        }

        .card-light {
          position: absolute;
          width: 360px;
          height: 360px;
          right: -170px;
          top: -220px;
          border-radius: 50%;
          filter: blur(90px);
          transition:
            transform 0.8s ease,
            opacity 0.5s ease;
          pointer-events: none;
        }

        .email-card .card-light {
          background: rgba(239, 35, 53, 0.08);
        }

        .whatsapp-card .card-light {
          background: rgba(37, 211, 102, 0.045);
        }

        .email-card:hover .card-light {
          transform: scale(1.35);
          opacity: 1.6;
        }

        .whatsapp-card:hover .card-light {
          transform: scale(1.35);
          opacity: 1.7;
        }

        .card-number {
          position: absolute;
          right: 25px;
          top: 22px;
          color: rgba(255, 255, 255, 0.045);
          font-size: 72px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -0.08em;
          user-select: none;
          transition: color 0.4s ease;
        }

        .email-card:hover .card-number {
          color: rgba(239, 35, 53, 0.08);
        }

        .whatsapp-card:hover .card-number {
          color: rgba(37, 211, 102, 0.065);
        }

        .card-top {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }

        .automation-icon {
          width: 55px;
          height: 55px;
          display: grid;
          place-items: center;
          border-radius: 11px;
          transition:
            transform 0.4s ease,
            box-shadow 0.4s ease;
        }

        .email-card .automation-icon {
          border: 1px solid rgba(239, 68, 68, 0.24);
          background: rgba(127, 29, 29, 0.15);
          color: #ef4444;
        }

        .whatsapp-card .automation-icon {
          border: 1px solid rgba(37, 211, 102, 0.2);
          background: rgba(37, 211, 102, 0.055);
          color: #25d366;
        }

        .automation-card:hover .automation-icon {
          transform: scale(1.08) rotate(-3deg);
        }

        .email-card:hover .automation-icon {
          box-shadow: 0 0 35px rgba(239, 35, 53, 0.18);
        }

        .whatsapp-card:hover .automation-icon {
          box-shadow: 0 0 35px rgba(37, 211, 102, 0.13);
        }

        .whatsapp-logo {
          width: 26px;
          height: 26px;
          fill: currentColor;
        }

        .card-arrow {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border: 1px solid #252528;
          border-radius: 8px;
          background: rgba(13, 13, 14, 0.8);
          color: #68686f;
          transition: all 0.35s ease;
        }

        .email-card:hover .card-arrow {
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.28);
          transform: translateX(2px);
        }

        .whatsapp-card:hover .card-arrow {
          color: #25d366;
          border-color: rgba(37, 211, 102, 0.25);
          transform: translateX(2px);
        }

        .visual-lines {
          position: absolute;
          right: 31px;
          top: 142px;
          width: 115px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          opacity: 0.22;
        }

        .visual-lines span {
          height: 1px;
          transform-origin: right;
          animation: scanLine 3s ease-in-out infinite;
        }

        .visual-lines span:nth-child(1) {
          width: 100%;
        }

        .visual-lines span:nth-child(2) {
          width: 72%;
          animation-delay: 0.25s;
        }

        .visual-lines span:nth-child(3) {
          width: 45%;
          animation-delay: 0.5s;
        }

        .email-card .visual-lines span {
          background: linear-gradient(
            to left,
            rgba(239, 68, 68, 0.7),
            transparent
          );
        }

        .whatsapp-card .visual-lines span {
          background: linear-gradient(
            to left,
            rgba(37, 211, 102, 0.65),
            transparent
          );
        }

        .card-content {
          position: relative;
          z-index: 2;
          margin-top: auto;
          max-width: 560px;
          padding-top: 35px;
        }

        .card-kicker {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.2em;
        }

        .email-card .card-kicker {
          color: rgba(239, 68, 68, 0.68);
        }

        .whatsapp-card .card-kicker {
          color: rgba(37, 211, 102, 0.68);
        }

        .card-content h3 {
          margin: 7px 0 0;
          color: #f5f5f6;
          font-size: clamp(23px, 2.2vw, 31px);
          line-height: 1.15;
          font-weight: 700;
          letter-spacing: -0.035em;
        }

        .card-content p {
          max-width: 470px;
          margin: 11px 0 0;
          color: #85858d;
          font-size: 14px;
          line-height: 1.55;
        }

        .card-footer {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 22px;
          padding-top: 15px;
          border-top: 1px solid #1d1d20;
          font-size: 12px;
          font-weight: 700;
        }

        .email-card .card-footer {
          color: #ef4444;
        }

        .whatsapp-card .card-footer {
          color: #25d366;
        }

        .card-footer svg {
          transition: transform 0.3s ease;
        }

        .automation-card:hover .card-footer svg {
          transform: translateX(5px);
        }

        /* FOOTER */

        .page-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          margin-top: 17px;
          padding-top: 14px;
          border-top: 1px solid #202023;
          color: #303035;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.2em;
        }

        .page-footer > div {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .page-footer svg {
          color: rgba(239, 35, 53, 0.5);
        }

        /* ANIMATIONS */

        @keyframes headerIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(0.9);
          }
          50% {
            opacity: 1;
            transform: scale(1.1);
          }
        }

        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
        }

        @keyframes ambientFloat {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(-18px, 15px, 0);
          }
        }

        @keyframes scanLine {
          0%,
          100% {
            transform: scaleX(0.65);
            opacity: 0.3;
          }
          50% {
            transform: scaleX(1);
            opacity: 0.9;
          }
        }

        @media (max-width: 900px) {
          .automations-page {
            padding: 28px;
          }

          .automation-card {
            padding: 22px;
          }

          .card-content h3 {
            font-size: 23px;
          }
        }

        @media (max-width: 700px) {
          :global(html),
          :global(body) {
            overflow: auto;
          }

          .automations-page {
            height: auto;
            min-height: 100dvh;
            overflow: visible;
            padding: 22px 20px 30px;
          }

          .page-shell {
            height: auto;
            min-height: calc(100dvh - 52px);
          }

          .page-header {
            padding-bottom: 21px;
          }

          .header-left {
            gap: 12px;
          }

          .back-button {
            width: 40px;
            height: 40px;
            flex-basis: 40px;
          }

          .title-line {
            flex-wrap: wrap;
            gap: 8px;
          }

          .title-line h1 {
            font-size: 30px;
          }

          .header-copy p {
            font-size: 13px;
          }

          .automation-section {
            padding-top: 21px;
          }

          .section-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 7px;
          }

          .automation-grid {
            grid-template-columns: 1fr;
            flex: none;
          }

          .automation-card {
            height: 285px;
            min-height: 285px;
          }
        }

        @media (max-width: 420px) {
          .automations-page {
            padding-left: 14px;
            padding-right: 14px;
          }

          .header-left {
            gap: 9px;
          }

          .back-button {
            width: 36px;
            height: 36px;
            flex-basis: 36px;
          }

          .eyebrow,
          .section-kicker {
            font-size: 10px;
          }

          .title-line h1 {
            font-size: 27px;
          }

          .automation-card {
            padding: 18px;
            height: 270px;
            min-height: 270px;
          }

          .card-number {
            right: 17px;
          }

          .visual-lines {
            right: 18px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .automations-page *,
          .automations-page *::before,
          .automations-page *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
