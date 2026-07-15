import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Phone, Mail, GraduationCap, Award, Sparkles } from "lucide-react";


import logoAsset from "@/assets/logo.png";
import heroAsset from "@/assets/hero.jpg";
import heritage1 from "@/assets/heritage-1.jpg";
import heritage2 from "@/assets/heritage-2.jpg";
import heritage3 from "@/assets/heritage-3.jpg";
import heritage4 from "@/assets/heritage-4.jpg";
import campus1 from "@/assets/campus-1.jpg";
import campus2 from "@/assets/campus-2.jpg";
import campus3 from "@/assets/campus-3.jpg";
import campus4 from "@/assets/campus-4.jpg";
import campus5 from "@/assets/campus-5.jpg";
import campus6 from "@/assets/campus-6.jpg";
import campus7 from "@/assets/campus-7.jpg";
import campus8 from "@/assets/campus-8.jpg";
import label1 from "@/assets/label-1.jpg";
import label2 from "@/assets/label-2.jpg";
import label3 from "@/assets/label-3.jpg";
import label4 from "@/assets/label-4.jpg";
import label5 from "@/assets/label-5.jpg";
import label6 from "@/assets/label-6.jpg";
import labelBadge from "@/assets/label-badge.jpg";

export const Route = createFileRoute("/")({
  component: Index,
});


const heritagePhotos = [
  { src: heritage1, alt: "Campus life at Carmel Saint Joseph" },
  { src: heritage2, alt: "Students and sisters in the historic school courtyard" },
  { src: heritage4, alt: "The school building framed by a flame tree in bloom" },
  { src: heritage3, alt: "Students playing volleyball in the school courtyard" },
  { src: campus7, alt: "Students visiting an elderly community member during a service outing" },
  { src: campus8, alt: "Students with the tiger mascot holding cat masks outside the school" },
];

const schoolLifePhotos = [
  { src: campus1, alt: "Students receiving certificates in traditional dress" },
  { src: campus3, alt: "Students gathered in the school courtyard" },
  { src: campus4, alt: "Students and teachers celebrating together outdoors" },
  { src: campus2, alt: "Students at the Concours Livres reading competition" },
  { src: campus5, alt: "Award ceremony with students and teachers in the classroom" },
  { src: campus6, alt: "Evening gathering of students under the school arches" },
];

const labelPhotos = [
  { src: label4, alt: "Carmelite sisters and staff receiving the French Quality Label certificates" },
  { src: label1, alt: "Sisters and delegates presenting the LabelFrancÉducation certificate" },
  { src: label2, alt: "Teachers and sisters gathered in the courtyard with the certificate" },
  { src: label3, alt: "Sisters proudly holding the LabelFrancÉducation award" },
  { src: label5, alt: "Official LabelFrancÉducation ceremony on stage" },
  { src: label6, alt: "School community celebrating the French Quality Label award" },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <Heritage />
        <CampusLife />
        <FrenchQualityLabel />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:flex sm:justify-between sm:px-6">
        <a href="#" className="flex min-w-0 items-center gap-3">
          <img
            src={logoAsset}
            alt="Carmel Saint Joseph logo"
            className="h-11 w-auto shrink-0"
          />
          <span className="min-w-0">
            <span className="heading-display block truncate text-base leading-tight text-primary sm:text-lg">
              Carmel Saint Joseph
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              École Des Carmélites
            </span>
          </span>
        </a>
        <nav className="hidden items-center gap-7 text-sm font-medium text-foreground md:flex">
          <a href="#heritage" className="transition-colors hover:text-primary">
            Our Heritage
          </a>
          <a href="#campus" className="transition-colors hover:text-primary">
            School Life
          </a>
          <a href="#french-label" className="transition-colors hover:text-primary">
            French Label
          </a>
          <a href="/auth" className="transition-colors hover:text-primary">
            Portal
          </a>
          <a
            href="#contact"
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary-glow"
          >
            Contact Us
          </a>
        </nav>
        <a
          href="/auth"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-glow md:hidden"
        >
          Portal
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-[88svh] items-center justify-center overflow-hidden">
      <img
        src={heroAsset}
        alt="Students and sisters of Carmel Saint Joseph gathered in the school courtyard"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="hero-overlay absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-24 text-center text-primary-foreground">
        <div className="mx-auto mb-8 grid h-28 w-28 place-items-center rounded-full bg-background shadow-lg">
          <img src={logoAsset} alt="" className="h-20 w-auto" />
        </div>
        <h1 className="heading-display text-5xl leading-tight sm:text-6xl md:text-7xl">
          Carmel Saint Joseph
        </h1>
        <p className="heading-display mt-4 text-xl italic opacity-90 sm:text-2xl">
          École Des Carmélites
        </p>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed opacity-90 sm:text-lg">
          A tradition of academic excellence and moral formation since our
          founding by the Carmelite sisters.
        </p>
        <div className="mt-10">
          <a href="#heritage" className="btn-hero">
            Discover Our Community
          </a>
        </div>
      </div>
    </section>
  );
}

function Heritage() {
  return (
    <section id="heritage" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="heading-display text-4xl text-primary sm:text-5xl">Our Heritage</h2>
          <span className="gold-rule mt-5" />
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Rooted in deep Catholic traditions, Carmel Saint Joseph has spent
            decades forming students not just intellectually, but morally and
            spiritually. We believe in educating the whole person in a warm,
            family-like environment.
          </p>
          <ul className="mt-8 space-y-4">
            <li className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                <GraduationCap className="h-4.5 w-4.5" />
              </span>
              <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Academic excellence</span> — a
                rigorous trilingual curriculum in Arabic, French, and English.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Moral formation</span> — guided by
                the Carmelite sisters, nurturing character and faith.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-primary">
                <Award className="h-4.5 w-4.5" />
              </span>
              <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Recognized quality</span> — holder
                of the French Quality Label, LabelFrancÉducation 2022.
              </p>
            </li>
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {schoolLifePhotos.map((photo, i) => (
            <div
              key={photo.src}
              className={`card-photo ${i % 2 === 0 ? "mt-8" : ""}`}
            >
              <img
                src={photo.src}
                alt={photo.alt}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CampusLife() {
  return (
    <section id="campus" className="scroll-mt-20 bg-secondary/60 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="heading-display text-4xl text-primary sm:text-5xl">School Life</h2>
          <span className="gold-rule mx-auto mt-5" />
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            From reading competitions and theatre to celebrations in our historic
            courtyard — every day at Carmel Saint Joseph is filled with learning,
            friendship, and joy.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {heritagePhotos.map((photo) => (
            <figure key={photo.src} className="card-photo group aspect-4/3 bg-card">
              <img
                src={photo.src}
                alt={photo.alt}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function FrenchQualityLabel() {
  return (
    <section id="french-label" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-14">
          <div className="mx-auto">
            <div className="grid h-44 w-44 place-items-center overflow-hidden rounded-full border-4 border-french-blue/20 bg-card shadow-lg sm:h-52 sm:w-52">
              <img
                src={labelBadge}
                alt="LabelFrancÉducation official badge"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
          <div className="text-center lg:text-left">
            <p className="text-sm font-semibold tracking-widest text-french-blue uppercase">
              LabelFrancÉducation
            </p>
            <h2 className="heading-display mt-2 text-4xl text-primary sm:text-5xl">
              French Quality Label 2022
            </h2>
            <span className="gold-rule mt-5 max-lg:mx-auto" />
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
              In 2022, Carmel Saint Joseph was awarded the prestigious{" "}
              <span className="font-semibold text-foreground">LabelFrancÉducation</span> by the
              French Ministry for Europe and Foreign Affairs — an official
              recognition of the excellence of our bilingual French education.
              This distinction celebrates the dedication of our sisters,
              teachers, and students to the French language and culture.
            </p>
          </div>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {labelPhotos.map((photo) => (
            <figure key={photo.src} className="card-photo group aspect-4/3 bg-card">
              <img
                src={photo.src}
                alt={photo.alt}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contact" className="scroll-mt-20 bg-primary text-primary-foreground">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="heading-display text-3xl sm:text-4xl">Get in Touch</h2>
            <span className="gold-rule mt-5" />
            <ul className="mt-8 space-y-5 text-sm sm:text-base">
              <li className="flex items-center gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary-foreground/25">
                  <MapPin className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">٣ شارع رستم الساحل شبرا</span>
              </li>
              <li className="flex items-center gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary-foreground/25">
                  <Phone className="h-4.5 w-4.5" />
                </span>
                <a href="tel:+15551234567" className="min-w-0 hover:underline">
                  +1 (555) 123-4567
                </a>
              </li>
              <li className="flex items-center gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary-foreground/25">
                  <Mail className="h-4.5 w-4.5" />
                </span>
                <a href="mailto:info@carmelstjoseph.edu" className="min-w-0 hover:underline">
                  info@carmelstjoseph.edu
                </a>
              </li>
            </ul>
          </div>
          <div className="flex flex-col items-start gap-4 md:items-end md:text-right">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-background">
              <img src={logoAsset} alt="Carmel Saint Joseph logo" className="h-14 w-auto" />
            </div>
            <p className="heading-display text-xl">Carmel Saint Joseph</p>
            <p className="max-w-xs text-sm leading-relaxed opacity-80">
              École Des Carmélites — forming hearts and minds in the Carmelite
              tradition.
            </p>
          </div>
        </div>
        <div className="mt-14 border-t border-primary-foreground/15 pt-6 text-center text-sm opacity-75">
          © {new Date().getFullYear()} Carmel Saint Joseph. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
