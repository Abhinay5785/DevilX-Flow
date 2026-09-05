"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace("/dashboard");
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="devilx-intro">
      {/* =====================================================
          BACKGROUND
      ===================================================== */}

      <div className="background-glow" />
      <div className="background-vignette" />

      {/* =====================================================
          PARTICLES
      ===================================================== */}

      <div className="particles">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      {/* =====================================================
          LARGE X

          This starts behind DevilX Flow and grows.
      ===================================================== */}

      <div className="back-x">X</div>

      {/* =====================================================
          MAIN BRAND
      ===================================================== */}

      <section className="logo-container">
        <div className="brand">
          <span className="devil">Devil</span>

          <span className="original-x">X</span>

          <span className="flow">Flow</span>
        </div>

        {/* =================================================
            ENERGY LINE
        ================================================= */}

        <div className="energy-line">
          <div className="energy-beam" />
        </div>

        {/* =================================================
            PAYMENT AUTOMATION
        ================================================= */}

        <div className="subtitle">
          PAYMENT AUTOMATION
        </div>
      </section>

      {/* =====================================================
          DEVELOPER CREDIT
      ===================================================== */}

      <div className="developer">
        Developed by{" "}
        <span>Abhinay Bogala</span>
      </div>

      {/* =====================================================
          FINAL FLASH
      ===================================================== */}

      <div className="final-flash" />

      <style jsx>{`
        /* =====================================================
           ROOT
        ===================================================== */

        .devilx-intro {
          position: fixed;
          inset: 0;

          z-index: 999999;

          width: 100vw;
          height: 100vh;

          overflow: hidden;

          display: flex;
          align-items: center;
          justify-content: center;

          background: #000000;

          color: #ffffff;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          isolation: isolate;

          animation:
            introExit
            0.7s
            ease-in
            3.8s
            forwards;
        }


        /* =====================================================
           SUBTLE BACKGROUND RED GLOW
        ===================================================== */

        .background-glow {
          position: absolute;

          left: 50%;
          top: 50%;

          width: 380px;
          height: 380px;

          transform:
            translate(-50%, -50%);

          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              rgba(255, 23, 68, 0.10) 0%,
              rgba(255, 23, 68, 0.045) 32%,
              transparent 72%
            );

          filter: blur(90px);

          animation:
            backgroundPulse
            2.2s
            ease-in-out
            infinite;
        }


        .background-vignette {
          position: absolute;

          inset: 0;

          pointer-events: none;

          background:
            radial-gradient(
              circle at center,
              transparent 15%,
              rgba(0, 0, 0, 0.25) 50%,
              rgba(0, 0, 0, 0.92) 100%
            );
        }


        /* =====================================================
           PARTICLES
        ===================================================== */

        .particles {
          position: absolute;

          inset: 0;

          pointer-events: none;
        }


        .particles span {
          position: absolute;

          width: 2px;
          height: 2px;

          border-radius: 50%;

          background: #ff1744;

          box-shadow:
            0 0 5px #ff1744,
            0 0 12px rgba(255, 23, 68, 0.7);

          opacity: 0;

          animation:
            particleFloat
            2.5s
            ease-in-out
            infinite;
        }


        .particles span:nth-child(1) {
          left: 7%;
          top: 21%;
          animation-delay: 0.1s;
        }

        .particles span:nth-child(2) {
          left: 14%;
          top: 65%;
          animation-delay: 0.5s;
        }

        .particles span:nth-child(3) {
          left: 19%;
          top: 33%;
          animation-delay: 0.9s;
        }

        .particles span:nth-child(4) {
          left: 26%;
          top: 79%;
          animation-delay: 1.3s;
        }

        .particles span:nth-child(5) {
          left: 32%;
          top: 17%;
          animation-delay: 0.4s;
        }

        .particles span:nth-child(6) {
          left: 39%;
          top: 88%;
          animation-delay: 1.1s;
        }

        .particles span:nth-child(7) {
          left: 44%;
          top: 27%;
          animation-delay: 1.7s;
        }

        .particles span:nth-child(8) {
          left: 52%;
          top: 11%;
          animation-delay: 0.7s;
        }

        .particles span:nth-child(9) {
          left: 58%;
          top: 91%;
          animation-delay: 1.5s;
        }

        .particles span:nth-child(10) {
          left: 64%;
          top: 24%;
          animation-delay: 0.3s;
        }

        .particles span:nth-child(11) {
          left: 70%;
          top: 76%;
          animation-delay: 1.8s;
        }

        .particles span:nth-child(12) {
          left: 76%;
          top: 14%;
          animation-delay: 0.8s;
        }

        .particles span:nth-child(13) {
          left: 82%;
          top: 45%;
          animation-delay: 1.4s;
        }

        .particles span:nth-child(14) {
          left: 89%;
          top: 69%;
          animation-delay: 0.6s;
        }

        .particles span:nth-child(15) {
          left: 94%;
          top: 28%;
          animation-delay: 1.9s;
        }

        .particles span:nth-child(16) {
          left: 5%;
          top: 82%;
          animation-delay: 1.2s;
        }

        .particles span:nth-child(17) {
          left: 22%;
          top: 52%;
          animation-delay: 2s;
        }

        .particles span:nth-child(18) {
          left: 73%;
          top: 58%;
          animation-delay: 1s;
        }

        .particles span:nth-child(19) {
          left: 36%;
          top: 47%;
          animation-delay: 0.2s;
        }

        .particles span:nth-child(20) {
          left: 87%;
          top: 88%;
          animation-delay: 1.6s;
        }

        .particles span:nth-child(21) {
          left: 12%;
          top: 47%;
          animation-delay: 0.7s;
        }

        .particles span:nth-child(22) {
          left: 93%;
          top: 52%;
          animation-delay: 1.3s;
        }

        .particles span:nth-child(23) {
          left: 48%;
          top: 94%;
          animation-delay: 1.8s;
        }

        .particles span:nth-child(24) {
          left: 61%;
          top: 38%;
          animation-delay: 0.4s;
        }


        /* =====================================================
           LARGE X BEHIND LOGO
        ===================================================== */

        .back-x {
          position: absolute;

          left: 50%;
          top: 50%;

          z-index: 2;

          font-family:
            Arial,
            Helvetica,
            sans-serif;

          font-size: 42vw;

          line-height: 0.8;

          font-weight: 900;

          color: #ff1744;

          opacity: 0;

          pointer-events: none;

          transform:
            translate(-50%, -50%)
            scale(0);

          transform-origin: center;

          text-shadow:
            0 0 10px #ff1744,
            0 0 25px #ff1744,
            0 0 50px #ff1744,
            0 0 100px #ff1744,
            0 0 180px rgba(255, 23, 68, 0.95),
            0 0 300px rgba(255, 23, 68, 0.8),
            0 0 500px rgba(255, 23, 68, 0.55);

          animation:
            backXExplosion
            1.15s
            cubic-bezier(0.16, 1, 0.3, 1)
            2.55s
            forwards;
        }


        /* =====================================================
           LOGO CONTAINER
        ===================================================== */

        .logo-container {
          position: relative;

          z-index: 8;

          display: flex;

          flex-direction: column;

          align-items: center;

          transform:
            translateY(-10px);

          animation:
            logoEntrance
            1s
            cubic-bezier(0.16, 1, 0.3, 1)
            0.05s
            forwards;
        }


        /* =====================================================
           COMPLETE DEVILX FLOW BRAND

           Entire thing disappears together.
        ===================================================== */

        .brand {
          display: flex;

          align-items: baseline;

          white-space: nowrap;

          font-size:
            clamp(
              58px,
              9vw,
              120px
            );

          line-height: 1;

          font-weight: 900;

          letter-spacing: -7px;

          animation:
            brandDisappear
            0.45s
            ease-in
            2.45s
            forwards;
        }


        /* =====================================================
           DEVIL
        ===================================================== */

        .devil {
          color: #ffffff;

          text-shadow:
            0 0 20px
            rgba(255, 255, 255, 0.05);
        }


        /* =====================================================
           ORIGINAL RED X

           Crisp foreground X.
        ===================================================== */

        .original-x {
          position: relative;

          display: inline-block;

          margin-left: 1px;

          color: #ff1744;

          text-shadow:
            0 0 5px #ff1744,
            0 0 12px #ff1744,
            0 0 25px #ff1744,
            0 0 45px rgba(255, 23, 68, 0.95),
            0 0 75px rgba(255, 23, 68, 0.65);

          animation:
            foregroundXPulse
            0.55s
            ease-in-out
            infinite
            alternate;
        }


        /* Glow around original X */

        .original-x::before {
          content: "";

          position: absolute;

          left: 50%;
          top: 50%;

          width: 90px;
          height: 90px;

          border-radius: 50%;

          background:
            rgba(255, 23, 68, 0.18);

          filter:
            blur(30px);

          transform:
            translate(-50%, -50%);

          z-index: -1;
        }


        /* =====================================================
           FLOW
        ===================================================== */

        .flow {
          margin-left: 13px;

          color: #ffffff;

          font-weight: 500;

          letter-spacing: -5px;

          text-shadow:
            0 0 15px
            rgba(255, 255, 255, 0.04);
        }


        /* =====================================================
           ENERGY LINE
        ===================================================== */

        .energy-line {
          position: relative;

          width: 190px;

          height: 2px;

          margin-top: 30px;

          overflow: hidden;

          border-radius: 999px;

          background:
            rgba(255, 23, 68, 0.25);

          box-shadow:
            0 0 8px rgba(255, 23, 68, 0.6),
            0 0 20px rgba(255, 23, 68, 0.3);

          opacity: 0;

          animation:
            lineEntrance
            0.7s
            ease
            0.75s
            forwards,
            lineDisappear
            0.35s
            ease-in
            2.45s
            forwards;
        }


        .energy-beam {
          position: absolute;

          left: -100%;

          top: 0;

          width: 70%;

          height: 100%;

          background:
            linear-gradient(
              90deg,
              transparent,
              #ff1744,
              #ffffff,
              #ff1744,
              transparent
            );

          box-shadow:
            0 0 10px #ff1744,
            0 0 25px #ff1744;

          animation:
            energyFlow
            1.1s
            linear
            1s
            infinite;
        }


        /* =====================================================
           PAYMENT AUTOMATION
        ===================================================== */

        .subtitle {
          margin-top: 15px;

          color:
            rgba(255, 255, 255, 0.42);

          font-size: 10px;

          font-weight: 500;

          letter-spacing: 5px;

          opacity: 0;

          transform:
            translateY(7px);

          animation:
            subtitleEntrance
            0.7s
            ease
            1s
            forwards,
            subtitleDisappear
            0.35s
            ease-in
            2.45s
            forwards;
        }


        /* =====================================================
           DEVELOPER CREDIT

           This disappears before the big X takes over.
        ===================================================== */

        .developer {
          position: absolute;

          left: 50%;
          bottom: 38px;

          z-index: 8;

          transform:
            translateX(-50%);

          white-space: nowrap;

          color:
            rgba(255, 255, 255, 0.32);

          font-size: 12px;

          letter-spacing: 1.5px;

          opacity: 0;

          animation:
            developerEntrance
            0.7s
            ease
            1.2s
            forwards,
            developerDisappear
            0.35s
            ease-in
            2.45s
            forwards;
        }


        .developer span {
          color:
            rgba(255, 255, 255, 0.82);
        }


        /* =====================================================
           FINAL FLASH
        ===================================================== */

        .final-flash {
          position: absolute;

          inset: 0;

          z-index: 30;

          background:
            radial-gradient(
              circle at center,
              rgba(255, 255, 255, 1) 0%,
              rgba(255, 23, 68, 0.95) 3%,
              rgba(255, 23, 68, 0.35) 12%,
              transparent 40%
            );

          opacity: 0;

          pointer-events: none;

          animation:
            finalFlash
            0.5s
            ease-out
            3.55s
            forwards;
        }


        /* =====================================================
           LOGO ENTRANCE
        ===================================================== */

        @keyframes logoEntrance {
          0% {
            opacity: 0;

            transform:
              translateY(-10px)
              scale(0.75);

            filter:
              blur(16px);
          }

          55% {
            opacity: 1;

            transform:
              translateY(-10px)
              scale(1.06);

            filter:
              blur(0);
          }

          100% {
            opacity: 1;

            transform:
              translateY(-10px)
              scale(1);
          }
        }


        /* =====================================================
           ENTIRE DEVILX FLOW DISAPPEARS

           Devil + X + Flow all disappear together.
        ===================================================== */

        @keyframes brandDisappear {
          0% {
            opacity: 1;

            transform:
              scale(1);

            filter:
              blur(0);
          }

          35% {
            opacity: 0.8;

            transform:
              scale(0.99);

            filter:
              blur(1px);
          }

          70% {
            opacity: 0.3;

            transform:
              scale(0.96);

            filter:
              blur(4px);
          }

          100% {
            opacity: 0;

            transform:
              scale(0.9);

            filter:
              blur(10px);
          }
        }


        /* =====================================================
           ORIGINAL X GLOW
        ===================================================== */

        @keyframes foregroundXPulse {
          0% {
            transform:
              scale(1);

            text-shadow:
              0 0 5px #ff1744,
              0 0 12px #ff1744,
              0 0 25px #ff1744,
              0 0 45px rgba(255, 23, 68, 0.7);
          }

          100% {
            transform:
              scale(1.025);

            text-shadow:
              0 0 8px #ff1744,
              0 0 18px #ff1744,
              0 0 35px #ff1744,
              0 0 65px #ff1744,
              0 0 100px rgba(255, 23, 68, 0.8);
          }
        }


        /* =====================================================
           LARGE X COMES FROM BEHIND

           Starts at the center and grows outward.
        ===================================================== */

        @keyframes backXExplosion {
          0% {
            opacity: 0;

            transform:
              translate(-50%, -50%)
              scale(0);

            filter:
              blur(18px);
          }

          15% {
            opacity: 0.12;

            transform:
              translate(-50%, -50%)
              scale(0.06);

            filter:
              blur(10px);
          }

          30% {
            opacity: 0.3;

            transform:
              translate(-50%, -50%)
              scale(0.18);

            filter:
              blur(6px);
          }

          45% {
            opacity: 0.6;

            transform:
              translate(-50%, -50%)
              scale(0.4);

            filter:
              blur(3px);
          }

          60% {
            opacity: 0.9;

            transform:
              translate(-50%, -50%)
              scale(0.75);

            filter:
              blur(1px);
          }

          75% {
            opacity: 1;

            transform:
              translate(-50%, -50%)
              scale(1.25);

            filter:
              blur(0);
          }

          88% {
            opacity: 1;

            transform:
              translate(-50%, -50%)
              scale(2.2);

            filter:
              blur(1px);
          }

          100% {
            opacity: 1;

            transform:
              translate(-50%, -50%)
              scale(4.5);

            filter:
              blur(3px);
          }
        }


        /* =====================================================
           ENERGY LINE
        ===================================================== */

        @keyframes lineEntrance {
          from {
            width: 0;

            opacity: 0;
          }

          to {
            width: 190px;

            opacity: 1;
          }
        }


        @keyframes lineDisappear {
          from {
            opacity: 1;
          }

          to {
            opacity: 0;
          }
        }


        @keyframes energyFlow {
          from {
            left: -100%;
          }

          to {
            left: 110%;
          }
        }


        /* =====================================================
           SUBTITLE
        ===================================================== */

        @keyframes subtitleEntrance {
          from {
            opacity: 0;

            transform:
              translateY(7px);
          }

          to {
            opacity: 1;

            transform:
              translateY(0);
          }
        }


        @keyframes subtitleDisappear {
          from {
            opacity: 1;
          }

          to {
            opacity: 0;
          }
        }


        /* =====================================================
           DEVELOPER
        ===================================================== */

        @keyframes developerEntrance {
          from {
            opacity: 0;

            transform:
              translateX(-50%)
              translateY(10px);
          }

          to {
            opacity: 1;

            transform:
              translateX(-50%)
              translateY(0);
          }
        }


        @keyframes developerDisappear {
          from {
            opacity: 1;

            transform:
              translateX(-50%)
              translateY(0);
          }

          to {
            opacity: 0;

            transform:
              translateX(-50%)
              translateY(5px);

            filter:
              blur(5px);
          }
        }


        /* =====================================================
           BACKGROUND
        ===================================================== */

        @keyframes backgroundPulse {
          0%,
          100% {
            transform:
              translate(-50%, -50%)
              scale(0.8);

            opacity: 0.35;
          }

          50% {
            transform:
              translate(-50%, -50%)
              scale(1.2);

            opacity: 0.8;
          }
        }


        /* =====================================================
           PARTICLES
        ===================================================== */

        @keyframes particleFloat {
          0%,
          100% {
            opacity: 0.05;

            transform:
              translateY(0)
              scale(0.7);
          }

          50% {
            opacity: 0.8;

            transform:
              translateY(-18px)
              scale(1.5);
          }
        }


        /* =====================================================
           FLASH
        ===================================================== */

        @keyframes finalFlash {
          0% {
            opacity: 0;
          }

          40% {
            opacity: 0;
          }

          62% {
            opacity: 0.08;
          }

          78% {
            opacity: 0.25;
          }

          100% {
            opacity: 0;
          }
        }


        /* =====================================================
           INTRO EXIT
        ===================================================== */

        @keyframes introExit {
          0% {
            opacity: 1;

            transform:
              scale(1);
          }

          76% {
            opacity: 1;

            transform:
              scale(1);
          }

          100% {
            opacity: 0;

            transform:
              scale(1.04);
          }
        }


        /* =====================================================
           MOBILE
        ===================================================== */

        @media (max-width: 600px) {
          .brand {
            font-size: 57px;

            letter-spacing: -4px;
          }

          .flow {
            margin-left: 8px;

            letter-spacing: -3px;
          }

          .energy-line {
            width: 150px;
          }

          .subtitle {
            font-size: 8px;

            letter-spacing: 3px;
          }

          .developer {
            bottom: 25px;

            font-size: 10px;
          }

          .back-x {
            font-size: 70vw;
          }
        }


        /* =====================================================
           REDUCED MOTION
        ===================================================== */

        @media (prefers-reduced-motion: reduce) {
          .devilx-intro,
          .background-glow,
          .particles span,
          .back-x,
          .logo-container,
          .brand,
          .original-x,
          .energy-line,
          .energy-beam,
          .subtitle,
          .developer,
          .final-flash {
            animation-duration: 0.01ms !important;

            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </main>
  );
}