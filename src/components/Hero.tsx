"use client";

import dynamic from "next/dynamic";
import { HERO_GRAPH } from "@/lib/taste-graph";
import { ConstellationFallback } from "./ConstellationFallback";
import { Icon } from "./Icon";

const TasteConstellation = dynamic(() => import("./TasteConstellation"), {
  ssr: false,
  loading: () => <div className="constellation constellation-hero"><ConstellationFallback /></div>,
});

export function Hero() {
  return <section className="hero" aria-labelledby="hero-heading">
    <div className="hero-copy">
      <p className="hero-intro"><span />For the wonderfully hard to buy for.</p>
      <h1 id="hero-heading">A gift that<br />gets them.</h1>
      <p className="hero-description">The albums on repeat. The films they quote. The worlds they get lost in. Turn what they love into a gift that feels like them.</p>
      <div className="hero-actions"><a href="#discover" className="button button-primary">Find their gifts<Icon name="arrow" size={18} /></a><a href="#samples" className="button button-quiet"><span className="play-circle"><Icon name="play" size={13} /></span>Watch a sample</a></div>
      <div className="hero-proof"><span className="qloo-wordmark">Qloo<span>↗</span></span><p>Cultural intelligence.<br />A little human thoughtfulness.</p></div>
    </div>
    <div className="hero-art">
      <TasteConstellation data={HERO_GRAPH} hero />
      <p className="hero-art-caption">An illustration of a connected taste.</p>
    </div>
    <div className="hero-bottom"><span>Every interest is a starting point.</span><div><span><Icon name="headphones" size={15} />Music</span><span><Icon name="film" size={15} />Cinema</span><span><Icon name="book" size={15} />Books</span><span><Icon name="camera" size={15} />Design</span><span><Icon name="spark" size={15} />And beyond</span></div></div>
  </section>;
}
