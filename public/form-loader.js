form.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // Dynamically get the URL from the 'action' attribute
  const targetURL = form.getAttribute('action'); 
  const formData = Object.fromEntries(new FormData(form));

  await fetch(targetURL, {
    method: "POST",
    body: JSON.stringify(formData),
    headers: { 
      "Content-Type": "application/json"
    }
  });
});