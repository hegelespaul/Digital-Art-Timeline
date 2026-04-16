let data;

fetch("data.json")
  .then(response => response.json())
  .then(async json => {
    data = json;
    renderTimeline();
    // small delay = smoother UX (optional)
    setTimeout(async () => {
      await waitForImages();
      document.getElementById("loader").classList.add("hidden");
    }, 300);
  })
  .catch(err => console.error("Could not load data.json:", err));

  function waitForImages() {
  const imgs = document.querySelectorAll("img");
  return Promise.all([...imgs].map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(res => {
      img.onload = img.onerror = res;
    });
  }));
}

function renderTimeline() {

  const container = document.getElementById("timeline-container");

  // ── Build all DOM structure inside #timeline-container ──────────────────────

  // Filter bar
  const filterBar = document.createElement("div");
  filterBar.id = "tl-filter-bar";
  filterBar.innerHTML = `
    <input type="text" id="tl-search" placeholder="Search title, artist, tag…">
    <span id="tl-count"></span>
  `;
  container.appendChild(filterBar);

  // Legend
  const legend = document.createElement("div");
  legend.id = "tl-legend";
  container.appendChild(legend);

  // Scroll wrapper + SVG
  const wrap = document.createElement("div");
  wrap.id = "tl-wrap";
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.id = "tl-svg";
  wrap.appendChild(svgEl);
  container.appendChild(wrap);

  // Tooltip
  const tooltip = document.createElement("div");
  tooltip.id = "tl-tooltip";
  container.appendChild(tooltip);

  // Cards are clickable directly — no need to click the tooltip

  // ── Constants ────────────────────────────────────────────────────────────────
  const START_YEAR = 1960;
  const END_YEAR = new Date().getFullYear();
  const PX_PER_YEAR = 80;
  const SVG_H = 1400;
  const AXIS_Y = SVG_H / 2;
  const CARD_W = 140;
  const CARD_H = 175;
  const STEM_BASE = 80;
  const STEM_STEP = CARD_H + 24;
  const TOTAL_W = (END_YEAR - START_YEAR + 2) * PX_PER_YEAR + 120;

  // ── Color palette assigned dynamically per tag ───────────────────────────────
  const PALETTE = [
    "#534AB7", "#0F6E56", "#993C1D", "#185FA5", "#3B6D11",
    "#993556", "#BA7517", "#A32D2D", "#639922", "#3B8BD4",
    "#5F5E5A", "#7F77DD", "#1D9E75", "#D85A30", "#378ADD",
    "#854F0B", "#72243E", "#085041", "#0C447C", "#444441"
  ];
  const tagColorMap = {};
  let paletteIdx = 0;

  function colorForTag(tag) {
    if (!tagColorMap[tag]) {
      tagColorMap[tag] = PALETTE[paletteIdx % PALETTE.length];
      paletteIdx++;
    }
    return tagColorMap[tag];
  }

  function cardColor(item) {
    return item.tags && item.tags.length ? colorForTag(item.tags[0]) : "#888";
  }

  function parseYear(item) {
    const raw = item.year ?? item.date ?? "";
    const m = String(raw).match(/\d{4}/);
    return m ? parseInt(m[0], 10) : null;
  }

  // ── Prepare data ─────────────────────────────────────────────────────────────
  const items = data
    .map(d => ({ ...d, _year: parseYear(d) }))
    .filter(d => d._year !== null);

  // All unique tags from the actual data
  const allTags = [...new Set(items.flatMap(d => d.tags || []))].sort();
  allTags.forEach(t => colorForTag(t));

  // ── Position items (above/below, stacked per year) ───────────────────────────
  const byYear = {};
  items.forEach(d => {
    if (!byYear[d._year]) byYear[d._year] = [];
    byYear[d._year].push(d);
  });

  const positioned = [];
  Object.values(byYear).forEach(group => {
    let above = 0, below = 0;
    group.forEach(item => {
      const isAbove = above <= below;
      const tier = isAbove ? above : below;
      const stemLen = STEM_BASE + tier * STEM_STEP;
      const cardY = isAbove ? AXIS_Y - stemLen - CARD_H : AXIS_Y + stemLen;
      if (isAbove) above++; else below++;
      positioned.push({ ...item, _above: isAbove, _cardY: cardY });
    });
  });

  // ── D3 scale ─────────────────────────────────────────────────────────────────
  const xScale = d3.scaleLinear()
    .domain([START_YEAR, END_YEAR + 1])
    .range([80, TOTAL_W - 60]);

  // ── SVG base ─────────────────────────────────────────────────────────────────
  const svg = d3.select("#tl-svg")
    .attr("width", TOTAL_W)
    .attr("height", SVG_H)
    .attr("viewBox", `0 0 ${TOTAL_W} ${SVG_H}`);

  // Axis
  svg.append("line")
    .attr("class", "tl-axis-line")
    .attr("x1", 40).attr("y1", AXIS_Y)
    .attr("x2", TOTAL_W - 20).attr("y2", AXIS_Y);

  // Ticks + labels
  for (let y = START_YEAR; y <= END_YEAR + 1; y++) {
    const x = xScale(y);
    const isDecade = y % 10 === 0;
    const isFive = y % 5 === 0;
    svg.append("line")
      .attr("class", isDecade ? "tl-decade-tick" : "tl-year-tick")
      .attr("x1", x).attr("y1", AXIS_Y - (isDecade ? 14 : 6))
      .attr("x2", x).attr("y2", AXIS_Y + (isDecade ? 14 : 6));
    if (isDecade) {
      svg.append("text").attr("class", "tl-decade-label")
        .attr("x", x).attr("y", AXIS_Y + 30).attr("text-anchor", "middle").text(y);
    } else if (isFive) {
      svg.append("text").attr("class", "tl-year-label")
        .attr("x", x).attr("y", AXIS_Y + 24).attr("text-anchor", "middle").text(y);
    }
  }

  // ── Tooltip helpers ──────────────────────────────────────────────────────────
  function showTooltip(event, d) {
    const imgHtml = d.image
      ? `<img class="tl-tt-img" src="${d.image}" alt="${d.title}">`
      : "";
    const tagsHtml = (d.tags || []).map(t =>
      `<span class="tl-tt-tag" style="background:${colorForTag(t)}18;color:${colorForTag(t)};border:0.5px solid ${colorForTag(t)}55">${t}</span>`
    ).join("");

    tooltip.innerHTML = `
      ${imgHtml}
      <div class="tl-tt-title">${d.title}</div>
      <div class="tl-tt-meta">${[d.artist, d._year, d.location].filter(Boolean).join(" · ")}</div>
      ${d.media_type ? `<div class="tl-tt-meta">${d.media_type}</div>` : ""}
      ${d.description ? `<div class="tl-tt-desc">${d.description}</div>` : ""}
      <div class="tl-tt-tags">${tagsHtml}</div>
    `;

    // Store link and update cursor
    tooltip._link = null; // click handled by card directly
    tooltip.style.cursor = "default";

    tooltip.classList.add("tl-visible");
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const tw = 270, th = 270;
    let left = event.clientX + 18;
    let top = event.clientY - 20;
    if (left + tw > window.innerWidth) left = event.clientX - tw - 18;
    if (top + th > window.innerHeight) top = window.innerHeight - th - 8;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function hideTooltip() { tooltip.classList.remove("tl-visible"); }

  // ── Render items ─────────────────────────────────────────────────────────────
  function render(subset) {
    svg.selectAll(".tl-item").remove();

    subset.forEach(d => {
      const x = xScale(d._year);
      const color = cardColor(d);
      const g = svg.append("g").attr("class", "tl-item");

      // Stem
      g.append("line")
        .attr("stroke", color).attr("stroke-width", 1).attr("stroke-opacity", 0.4)
        .attr("x1", x).attr("y1", AXIS_Y + (d._above ? -5 : 5))
        .attr("x2", x).attr("y2", d._above ? d._cardY + CARD_H : d._cardY);

      // Card via foreignObject (so <img> works)
      const fo = g.append("foreignObject")
        .attr("x", x - CARD_W / 2).attr("y", d._cardY)
        .attr("width", CARD_W).attr("height", CARD_H)
        .attr("overflow", "visible");


      const div = fo.append("xhtml:div")
        .attr("class", "tl-card")
        .style("border-color", color)
        .style("cursor", d.link ? "pointer" : "default")
        .on("mouseover", e => showTooltip(e, d))
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .on("click", () => { if (d.link) window.open(d.link, "_blank"); });

      // ── IMAGE (full card image, no placeholder text) ──────────────────────
      if (d.image) {
        div.append("xhtml:img")
          .attr("src", d.image).attr("alt", d.title).attr("class", "tl-card-img");
      } else {
        div.append("xhtml:div")
          .attr("class", "tl-card-placeholder")
          .style("background", color + "18");
      }

      // ── CARD BODY: title + artist only ────────────────────────────────────
      const body = div.append("xhtml:div").attr("class", "tl-card-body");
      body.append("xhtml:div").attr("class", "tl-card-title").style("color", color).text(d.title);
      body.append("xhtml:div").attr("class", "tl-card-artist").text(d.artist);
      // Year and tags intentionally omitted — shown in tooltip on hover

      // Axis dot
      g.append("circle")
        .attr("cx", x).attr("cy", AXIS_Y).attr("r", 5)
        .attr("fill", color).attr("stroke", "white").attr("stroke-width", 1.5);
    });

    document.getElementById("tl-count").textContent =
      `${subset.length} work${subset.length !== 1 ? "s" : ""}`;
  }

  // ── Legend (tags from data only) ─────────────────────────────────────────────
  legend.innerHTML = allTags.map(t => `
    <span class="tl-legend-item" data-tag="${t}">
      <span class="tl-legend-dot" style="background:${colorForTag(t)}"></span>${t}
    </span>
  `).join("");

  let activeTag = null;

  legend.querySelectorAll(".tl-legend-item").forEach(el => {
    el.addEventListener("click", () => {
      const tag = el.dataset.tag;
      activeTag = activeTag === tag ? null : tag;
      legend.querySelectorAll(".tl-legend-item").forEach(e => {
        e.style.opacity = (!activeTag || e.dataset.tag === activeTag) ? "1" : "0.35";
      });
      applyFilters();
    });
  });

  // ── Search ───────────────────────────────────────────────────────────────────
  document.getElementById("tl-search").addEventListener("input", applyFilters);

  function applyFilters() {
    const q = (document.getElementById("tl-search").value || "").toLowerCase().trim();

    let subset = positioned;

    if (activeTag) {
      subset = subset.filter(d => (d.tags || []).includes(activeTag));
    }

    if (q) {
      subset = subset.filter(d =>
        (d.title || "").toLowerCase().includes(q) ||
        (d.artist || "").toLowerCase().includes(q) ||
        (d.media_type || "").toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q) ||
        (d.location?.city || "").toLowerCase().includes(q) ||
        (d.location?.country || "").toLowerCase().includes(q) ||
        (d.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    render(subset);
  }

  // ── Drag-to-scroll ───────────────────────────────────────────────────────────
  let isDown = false, startX, startY, scrollLeft, scrollTop;
  wrap.addEventListener("mousedown", e => {
    isDown = true;
    startX = e.pageX - wrap.offsetLeft;
    startY = e.pageY - wrap.offsetTop;
    scrollLeft = wrap.scrollLeft;
    scrollTop = wrap.scrollTop;
    wrap.style.cursor = "grabbing";
  });
  wrap.addEventListener("mouseleave", () => { isDown = false; wrap.style.cursor = "grab"; });
  wrap.addEventListener("mouseup", () => { isDown = false; wrap.style.cursor = "grab"; });
  wrap.addEventListener("mousemove", e => {
    if (!isDown) return;
    e.preventDefault();
    wrap.scrollLeft = scrollLeft - (e.pageX - wrap.offsetLeft - startX);
    wrap.scrollTop = scrollTop - (e.pageY - wrap.offsetTop - startY);
  });

  const annotations = [
    {
      year: 1963,
      text: "ASCII used for the very first time",
      url: "https://en.wikipedia.org/wiki/ASCII"
    },
    {
      year: 1964,
      text: "'Understanding Media' by Marshall McLuhan",
      url: "https://en.wikipedia.org/wiki/Understanding_Media"
    },
    {
      year: 1966,
      text: "E.A.T. (Experiments in Art and Technology, Inc.)",
      url: "https://en.wikipedia.org/wiki/Experiments_in_Art_and_Technology"
    },
    {
      year: 1967,
      text: "Portapak, the first portable video camera",
      url: "https://en.wikipedia.org/wiki/Portapak"
    },
    {
      year: 1968,
      text: "'Cybernetic Serendipity' Exhibition",
      url: "https://en.wikipedia.org/wiki/Cybernetic_Serendipity"
    },
    {
      year: 1969,
      text: "ARPANET, the precursor to the internet",
      url: "https://en.wikipedia.org/wiki/ARPANET"
    },
    {
      year: 1970,
      text: "'Software' exhibition at the Jewish Museum, New York",
      url: "https://monoskop.org/images/3/31/Software_Information_Technology_Its_New_Meaning_for_Art_catalogue.pdf"
    },
    {
      year: 1971,
      text: "First floppy disk by IBM",
      url: "https://en.wikipedia.org/wiki/Floppy_disk"
    },
    {
      year: 1971,
      text: "First email sent by Ray Tomlinson",
      url: "https://www.computinghistory.org.uk/det/6116/first-e-mail-sent-by-ray-tomlinson/"
    },
    {
      year: 1972,
      text: "First video game console (Magnavox Odyssey)",
      url: "https://en.wikipedia.org/wiki/Magnavox_Odyssey"
    },
    {
      year: 1972,
      text: "Project Xanadú, early interactive multimedia system by Alan Kay and Adele Goldberg at Xerox PARC",
      url: "https://www.xanadu.net/"
    },
    {
      year: 1973,
      text: "Computer Lib/Dream Machines by Ted Nelson",
      url: "https://en.wikipedia.org/wiki/Computer_Lib/Dream_Machines"
    },
    {
      year: 1975,
      text: "Altair 8800, the first personal computer",
      url: "https://en.wikipedia.org/wiki/Altair_8800"
    },
    {
      year: 1976,
      text: "Apple Computer founded by Steve Jobs and Steve Wozniak",
      url: "https://en.wikipedia.org/wiki/Apple_Computer"
    },
    {
      year: 1979,
      text: "First Ars Electronica festival in Linz, Austria",
      url: "https://en.wikipedia.org/wiki/Ars_Electronica"
    },
    {
      year: 1981,
      text: "Operative system MS-DOS released by Microsoft",
      url: "https://en.wikipedia.org/wiki/MS-DOS"
    },
    {
      year: 1981,
      text: "Time Magazine's 'Machine of the Year' is the Computer",
      url: "https://thisdayintechhistory.com/12/26/personal-computer-man-of-the-year/"
    },
    {
      year: 1982,
      text: "First computer virus (Elk Cloner)",
      url: "https://en.wikipedia.org/wiki/Elk_Cloner"
    },
    {
      year: 1983,
      text: "First mobile phone (Motorola DynaTAC 8000X)",
      url: "https://en.wikipedia.org/wiki/Motorola_DynaTAC_8000X"
    },
    {
      year: 1983,
      text: "MIDI (Musical Instrument Digital Interface) standard established",
      url: "https://en.wikipedia.org/wiki/MIDI"
    },
    {
      year: 1984,
      text: "William Gibson's novel 'Neuromancer' published, it introduces the concept of 'cyberspace'.",
      url: "https://en.wikipedia.org/wiki/Neuromancer"
    },
    {
      year: 1984,
      text: "VPL Research founded by Jaron Lanier, popularizing the term 'virtual reality'",
      url: "https://en.wikipedia.org/wiki/VPL_Research"
    },
    {
      year: 1985,
      text: "MIT Media Lab founded by Nicholas Negroponte",
      url: "https://en.wikipedia.org/wiki/MIT_Media_Lab"
    },
    {
      year: 1986,
      text: "PIXAR founded by Ed Catmull and Alvy Ray Smith",
      url: "https://en.wikipedia.org/wiki/PIXAR"
    },
    {
      year: 1987,
      text: "Adbe Illustrator released, popularizing vector graphics",
      url: "https://en.wikipedia.org/wiki/Adobe_Illustrator"
    },
    {
      year: 1988,
      text: "First ISEA (International Symposium on Electronic Art)",
      url: "https://en.wikipedia.org/wiki/International_Symposium_on_Electronic_Art"
    },
    {
      year: 1989,
      text: "Tim Berners-Lee invents the World Wide Web",
      url: "https://en.wikipedia.org/wiki/World_Wide_Web"
    },
    {
      year: 1989,
      text: "ZKM Center for Art and Media founded in Karlsruhe, Germany",
      url: "https://en.wikipedia.org/wiki/ZKM_Center_for_Art_and_Media"
    },
    {
      year: 1990,
      text: "Invention of the World Wide Web",
      url: "https://en.wikipedia.org/wiki/World_Wide_Web"
    },
    {
      year: 1991,
      text: "Linux 0.01 released by Linus Torvalds",
      url: "https://en.wikipedia.org/wiki/Linux_kernel"
    },
    {
      year: 1992,
      text: "AT&T introduces the video phone, an early attempt at video calling",
      url: "https://www.britannica.com/technology/videophone"
    },
    {
      year: 1993,
      text: "Wired magazine founded, covering the intersection of technology, culture, and art",
      url: "https://en.wikipedia.org/wiki/Wired_(magazine)"
    },
    {
      year: 1994,
      text: "Netscape goes on market boursark, popularizing the internet for mainstream users",
      url: "https://en.wikipedia.org/wiki/Netscape"
    },
    {
      year: 1995,
      text: "artnet founded by Charles Saatchi, one of the first online art marketplaces",
      url: "https://en.wikipedia.org/wiki/Artnet"
    },
    {
      year: 1995,
      text: "World's first web art museum acquisition: The World's First Collaborative Sentence by Douglas Davis donated to Withney Museum of American Art",
      url: "https://proyectoidis.org/the-worlds-first-collaborative-sentence/"
    },
    {
      year: 1996,
      text: "Rhizome founded by Mark Tribe, dedicated to the preservation and presentation of digital art",
      url: "https://rhizome.org/about/"
    },
    {
      year: 1996,
      text: "Eyebeam founded in New York, a center for art and technology",
      url: "https://www.eyebeam.org/"
    },
    {
      year: 1997,
      text: "ZKM center for Art and Media in Karlsruhe, Germany, opens to the public as a major institution dedicated to media art",
      url: "https://www.zkm.de/en"
    },
    {
      year: 1997,
      text: "Tokio InterCommunication Center (TICC) opens in Tokyo, Japan, as a hub for media art",
      url: "https://www.ntticc.or.jp/en/"
    },
    {
      year: 1998,
      text: "Google founded by Larry Page and Sergey Brin, revolutionizing access to information and impacting digital culture profoundly",
      url: "https://en.wikipedia.org/wiki/Google"
    },
    {
      year: 1999,
      text: "Napster launched by Shawn Fanning, pioneering peer-to-peer file sharing and impacting digital media distribution",
      url: "https://en.wikipedia.org/wiki/Napster"
    }
  ];

  function renderAnnotations(data) {
    svg.selectAll(".tl-annotation").remove();

    data.forEach((d, i) => {
      const x = xScale(d.year);
      const isAbove = i % 2 === 0;

      const y1 = AXIS_Y;
      const y2 = isAbove ? AXIS_Y - 40 : AXIS_Y + 40;

      const g = svg.append("g")
        .attr("class", "tl-annotation")
        .style("pointer-events", "all")
        .style("cursor", d.url ? "pointer" : "default"); // ← cursor feedback

      // ── Invisible hit area ─────────────────────────
      g.append("line")
        .attr("x1", x).attr("x2", x)
        .attr("y1", y1).attr("y2", y2)
        .attr("stroke", "transparent")
        .attr("stroke-width", 12);

      // ── Visible dashed line ────────────────────────
      g.append("line")
        .attr("x1", x).attr("x2", x)
        .attr("y1", y1).attr("y2", y2)
        .attr("stroke", "#888")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2");

      // ── Axis dot ───────────────────────────────────
      g.append("circle")
        .attr("cx", x)
        .attr("cy", AXIS_Y)
        .attr("r", 3)
        .attr("fill", "#888");

      // ── Arrow (triangle) ───────────────────────────
      const arrowSize = 6;

      g.append("path")
        .attr("class", "tl-annotation-arrow")
        .attr("d", isAbove
          ? `M ${x - arrowSize} ${y2} L ${x + arrowSize} ${y2} L ${x} ${y2 + arrowSize} Z`
          : `M ${x - arrowSize} ${y2} L ${x + arrowSize} ${y2} L ${x} ${y2 - arrowSize} Z`
        )
        .attr("fill", d.url ? "#555" : "#888") // ← subtle clickable hint
        .attr("transform-origin", `${x}px ${y2}px`)
        .attr("transform", "scale(1)")
        .attr("cursor", d.url ? "pointer" : "default");

      // ── Hover interaction ──────────────────────────
      g.on("mouseover", function (e) {

        d3.select(this).select(".tl-annotation-arrow")
          .transition()
          .duration(150)
          .attr("transform", "scale(1.8)");

        d3.select(this).selectAll("line")
          .transition()
          .attr("stroke-opacity", 1);

        tooltip.innerHTML = `
        <div class="tl-tt-desc">${d.text}</div>
        <div class="tl-tt-meta">${d.year}</div>
      `;
        tooltip.classList.add("tl-visible");
        moveTooltip(e);
      })
        .on("mousemove", moveTooltip)
        .on("mouseout", function () {

          d3.select(this).select(".tl-annotation-arrow")
            .transition()
            .duration(150)
            .attr("transform", "scale(1)");

          d3.select(this).selectAll("line")
            .transition()
            .attr("stroke-opacity", 0.5);

          hideTooltip();
        })
        .on("click", () => {                    // ← NEW
          if (d.url) {
            window.open(d.url, "_blank");
          }
        });
    });
  }

  // ── Initial render, scroll to ~1995 ─────────────────────────────────────────
  render(positioned);
  renderAnnotations(annotations);
  setTimeout(() => {
    wrap.scrollLeft = xScale(1995) - wrap.clientWidth / 2;
    wrap.scrollTop = AXIS_Y - wrap.clientHeight / 2.1;  /* add this */
  }, 50);
}

