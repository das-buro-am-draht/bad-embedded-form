document.addEventListener("DOMContentLoaded", () => {
  const forms = document.querySelectorAll('form[data-custom-form]');

  forms.forEach(form => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.innerText;
      btn.disabled = true;
      btn.innerText = "Sending...";

      const formData = Object.fromEntries(new FormData(form));

      try {
        const response = await fetch("https://your-app.netlify.app/.netlify/functions/submit", {
          method: "POST",
          body: JSON.stringify(formData),
          headers: { "Content-Type": "application/json" }
        });

        if (response.ok) {
          alert("Success! Data sent.");
          form.reset();
        } else {
          throw new Error("Submission failed.");
        }
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.innerText = originalText;
      }
    });
  });
});