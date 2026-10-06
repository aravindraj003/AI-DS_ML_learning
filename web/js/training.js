/* AI&DS-ML LEARNING — Model Training Practice page.
   External practice workspace: NextLeap Jupyter Notebook + Python (Pyodide). */

const MODEL_TRAINING_NOTEBOOK_URL = 'https://nextleap.app/online-compiler/jupyter-notebook';

const MODEL_TRAINING_SAMPLE = `# Machine Learning Practice — Iris Classification
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score, classification_report

# 1. Load a built-in dataset
iris = load_iris()
X = iris.data
y = iris.target

# 2. Split into training and testing data
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 3. Create and train the model
model = DecisionTreeClassifier(max_depth=3, random_state=42)
model.fit(X_train, y_train)

# 4. Predict on test data
y_pred = model.predict(X_test)

# 5. Evaluate the model
accuracy = accuracy_score(y_test, y_pred)
print(f"Accuracy: {accuracy:.2%}")

print("\\nClassification report:")
print(classification_report(y_test, y_pred, target_names=iris.target_names))`;

function copyMLTrainingCode() {
  navigator.clipboard?.writeText(MODEL_TRAINING_SAMPLE)
    .then(() => toast('Sample ML code copied.'))
    .catch(() => toast('Copy is unavailable. Select and copy the code manually.'));
}

function openMLTrainingNotebook() {
  window.open(MODEL_TRAINING_NOTEBOOK_URL, '_blank', 'noopener,noreferrer');
}

function trainingPracticePage() {
  return `
    <div class="trainingPage">
      <div class="trainingHero">
        <div class="trainingHeroCopy">
          <div class="eyebrow">PRACTICAL ML WORKSPACE</div>
          <h1>Model Training <span>Practice</span></h1>
          <p>Train and test machine learning models directly in an online Jupyter Notebook. No local installation is required for this guided practice.</p>
          <div class="trainingHeroActions">
            <button class="primary" type="button" onclick="openMLTrainingNotebook()">🚀 Open Jupyter Notebook</button>
            <button class="secondary" type="button" onclick="go('courses')">Back to Course</button>
          </div>
        </div>
        <div class="trainingHeroArt" aria-hidden="true">
          <div class="trainingOrb">🧪</div>
          <div class="trainingMiniCard"><strong>Python</strong><span>Pyodide</span></div>
          <div class="trainingMiniCard"><strong>ML</strong><span>Train · Test · Evaluate</span></div>
        </div>
      </div>

      <div class="panel trainingLaunchPanel">
        <div class="panelTitle">
          <div><h2>Start your model training</h2><p class="muted">Use the external Jupyter Notebook workspace for hands-on Python ML practice.</p></div>
          <span class="tag">ONLINE</span>
        </div>
        <div class="trainingSteps">
          <div class="trainingStep">
            <div class="trainingStepNo">01</div>
            <div><h3>Open the notebook</h3><p>Click the <b>Jupyter Notebook</b> button above. It opens the online notebook workspace in a new tab.</p><button class="linkLike" type="button" onclick="openMLTrainingNotebook()">Open Jupyter Notebook ↗</button></div>
          </div>
          <div class="trainingStep">
            <div class="trainingStepNo">02</div>
            <div><h3>Select Python (Pyodide)</h3><p>Inside the notebook, choose <b>Python (Pyodide)</b> as the runtime/language option for browser-based Python execution.</p></div>
          </div>
          <div class="trainingStep">
            <div class="trainingStepNo">03</div>
            <div><h3>Create a code cell</h3><p>Add or select a Python code cell, then paste the sample program shown below. Run the cell using the notebook's ▶ Run/Play control.</p></div>
          </div>
          <div class="trainingStep">
            <div class="trainingStepNo">04</div>
            <div><h3>Read the model output</h3><p>Check the accuracy and classification report. Then change the model settings, retrain it and compare the results.</p></div>
          </div>
        </div>
      </div>

      <div class="trainingGrid">
        <div class="panel">
          <div class="panelTitle"><div><h2>What is Pyodide?</h2><p class="muted">Python running in your browser</p></div><span class="trainingPill">BROWSER ML</span></div>
          <p class="trainingText">Pyodide brings Python to the browser through WebAssembly. The current Pyodide distribution includes scientific libraries such as NumPy, pandas, SciPy and scikit-learn, making it suitable for introductory machine learning exercises.</p>
          <div class="trainingChecklist">
            <div>✓ Run Python without installing Python locally</div>
            <div>✓ Practice NumPy and pandas data handling</div>
            <div>✓ Train scikit-learn models</div>
            <div>✓ Test, evaluate and improve your models</div>
          </div>
        </div>

        <div class="panel">
          <div class="panelTitle"><div><h2>Practice roadmap</h2><p class="muted">Use the notebook like a small ML lab</p></div></div>
          <div class="trainingRoadmap">
            <div><span>1</span><div><b>Load data</b><small>Dataset → features (X) → target (y)</small></div></div>
            <div><span>2</span><div><b>Prepare data</b><small>Clean, split and transform inputs</small></div></div>
            <div><span>3</span><div><b>Train model</b><small>Fit a classifier or regression model</small></div></div>
            <div><span>4</span><div><b>Evaluate</b><small>Accuracy, errors and model behaviour</small></div></div>
          </div>
        </div>
      </div>

      <div class="panel trainingCodePanel">
        <div class="panelTitle trainingCodeHeader">
          <div><div class="eyebrow">READY-TO-RUN EXAMPLE</div><h2>Iris Classification with Decision Tree</h2><p class="muted">Paste this into a Python (Pyodide) notebook cell and run it.</p></div>
          <button class="secondary" type="button" onclick="copyMLTrainingCode()">⧉ Copy Code</button>
        </div>
        <pre class="trainingCode"><code>${escapeHtml(MODEL_TRAINING_SAMPLE)}</code></pre>
      </div>

      <div class="panel trainingPracticeTips">
        <div class="panelTitle"><h2>After your first run</h2><span class="tag">NEXT STEPS</span></div>
        <div class="tipGrid">
          <div class="tipCard"><b>Try another model</b><p>Replace Decision Tree with Logistic Regression or another classifier supported by scikit-learn.</p></div>
          <div class="tipCard"><b>Change test size</b><p>Try 0.3 instead of 0.2 and compare the evaluation result.</p></div>
          <div class="tipCard"><b>Change model settings</b><p>Modify <code>max_depth</code> and observe how model complexity affects the result.</p></div>
          <div class="tipCard"><b>Experiment with data</b><p>Use pandas and NumPy to inspect, transform and analyse datasets before training.</p></div>
        </div>
      </div>

      <div class="trainingNotice">
        <span class="trainingNoticeIcon">ℹ</span>
        <div><b>Practice workspace note</b><p>The notebook opens on the external NextLeap platform in a new browser tab. Your LMS provides the learning instructions and sample exercise; notebook execution is handled by that external service.</p></div>
      </div>
    </div>`;
}
