import Nav from '@/components/landing/Nav';
import Hero from '@/components/landing/Hero';
import Theater from '@/components/landing/Theater';
import Command from '@/components/landing/Command';
import Arsenal from '@/components/landing/Arsenal';
import InkSection from '@/components/landing/InkSection';
import Remembers from '@/components/landing/Remembers';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <div className="lp-root">
      <Nav />
      <Hero />
      <Theater />
      <Command />
      <Arsenal />
      <InkSection />
      <Remembers />
      <Footer />
    </div>
  );
}

