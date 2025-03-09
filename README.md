## **📰 inFact – AI-Powered Fact-Checking Chrome Extension**  

**Verify online information instantly with AI. Get truth scores, fact-checking insights, and cited sources—directly in your browser.**

**This was created as part of the CCDS 2025 Techfest Hackathon**

![image](https://github.com/user-attachments/assets/c5b42927-3357-4f85-8ce0-2120d41e8389)


---

## **📌 Features**  
✅ **Truth Score** – AI-generated **credibility rating** for selected text.  
✅ **Fact-Checking Insights** – Detects **misleading claims, manipulated quotes, and false statistics**.  
✅ **Cited Sources** – Lists **verified references** to support fact-checking.  
✅ **Deepfake Video Detection** – Identifies **altered content in videos**.  
✅ **Right-Click Integration** – **Instantly fact-check** without switching tabs.  
✅ **Dark Mode Support** – Works in both **light and dark themes**.  

---

## **🚀 Installation**  

### **1️⃣ Load the Extension Manually**  
Since this extension is not available in the Chrome Web Store, follow these steps to install it:  

1. **Download or Clone** this repository:  
   ```bash
   git clone https://github.com/your-username/inFact.git
   cd inFact
   ```  
2. Open **Google Chrome** and go to:  
   ```
   chrome://extensions/
   ```  
3. **Enable "Developer mode"** (toggle in the top-right corner).  
4. Click **"Load unpacked"** and **select the downloaded folder**.  
5. The extension should now appear in your Chrome toolbar! 🎉  

---

## **🔍 How to Use**  

### **🔹 Setup (First-Time Users)**  
1️⃣ Open the extension popup and **enter your Perplexity API Key**.  
2️⃣ Click **"Save"** to store your key.  

![image](https://github.com/user-attachments/assets/e0ae18da-b829-41b4-a8ad-cc2bd1c7e535)


### **🔹 Fact-Check Text**  
1️⃣ **Highlight any text** on a webpage.  
2️⃣ **Right-click** and select **"Fact Check with AI"**.  
3️⃣ A popup will show the **truth score, fact-check insights, and sources**.  

### **🔹 Verify Manually Entered Text**  
1️⃣ Click the extension icon in the toolbar.  
2️⃣ Type or paste text into the input box.  
3️⃣ Click **"Check Facts"** to receive results.  



![image](https://github.com/user-attachments/assets/af02a3a0-ca2f-4d47-a2c6-2b4f5fd29e6d)![image](https://github.com/user-attachments/assets/b261825e-149f-4b1a-95be-0db92c18d66f)

** It even works with Highly Technical Subjects, being able to cite datasheets ** 

![image](https://github.com/user-attachments/assets/513e7c47-932a-426e-bde5-dc7ca6e47f11)![image](https://github.com/user-attachments/assets/b186af67-d14c-438e-a577-076aaf83ba4b)




---

## **🛠️ Tech Stack**  

### **Languages & Core Technologies**  
- **JavaScript** – Core functionality of the extension.  
  - Files: `content.js`, `background.js`, `popup.js`.  
- **HTML & CSS** – Used for the UI design.  
  - Files: `popup.html`, `styles.css`.  

### **APIs & Services**  
- **Perplexity AI API** – Generates **truth scores, fact-checking insights, and sources**.  
- **Chrome Extensions API** – Handles **context menus, background tasks, and UI interactions**.  

### **Browser Features**  
- **Clipboard API** – Copies fact-check results.  
- **DOM Manipulation** – Dynamically updates UI elements.  
- **Event Listeners** – Detects user actions (e.g., right-click, button clicks).  

---

## **⚡ Challenges & Improvements**  
### **Challenges We Faced**  
- Ensuring **accurate truth scores** for complex claims.  
- Detecting **subtle misinformation** in well-crafted AI-generated articles.  
- Balancing **speed and accuracy** for real-time fact-checking.  

### **Future Enhancements**  
✅ **Support for multiple browsers** (Firefox, Safari, Edge).  
✅ **More advanced deepfake detection** for manipulated videos.  
✅ **Real-time misinformation alerts** for trending false claims.  
✅ **Improved UI with additional customization options**.  

---

## **📜 License**  
This project is licensed under the **MIT License**.  

---

## **📢 Contributing**  
We welcome contributions! 🚀  

### **How to Contribute**  
1. **Fork this repository**.  
2. **Create a new branch** for your feature or bug fix.  
3. **Commit your changes** and push to your fork.  
4. **Submit a Pull Request (PR)** for review.  

---

## **📬 Contact & Feedback**  
If you encounter any issues or have suggestions, feel free to:  
- Open an issue on **GitHub**  
- Reach out via **email** or **social media**  

---

