import { onMounted, onUnmounted, ref } from 'vue';

export function useScrollAnimation() {
  const observerRef = ref<IntersectionObserver | null>(null);

  onMounted(() => {
    observerRef.value = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observerRef.value?.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
      }
    );

    document.querySelectorAll('.fade-section').forEach((el) => {
      observerRef.value?.observe(el);
    });
  });

  onUnmounted(() => {
    observerRef.value?.disconnect();
  });
}
