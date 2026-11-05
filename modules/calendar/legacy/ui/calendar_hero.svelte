<script>
  let { i18n } = $props();
</script>

<section class="box _outer hero flex gap _2">
  <div>
    <span>{i18n.eyebrow}</span>
    <h1>{i18n.title}</h1>
    <p>{i18n.description}</p>
  </div>
</section>

<style>
  .hero {    justify-content: space-between;    align-items: center;
    flex-wrap: wrap;
    padding: 18px;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    font-size: clamp(30px, 4vw, 48px);
    letter-spacing: 0;
  }

  p,
  span {
    color: #667085;
  }
</style>
