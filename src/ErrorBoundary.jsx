import React from "react";

// Filet de sécurité : si une erreur de rendu survient (ex. donnée corrompue
// dans le localStorage), on affiche un message clair plutôt qu'un écran blanc,
// avec la possibilité de réinitialiser les données locales.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Suivi Permis — erreur interceptée :", error, info);
  }

  handleReset = () => {
    try {
      localStorage.removeItem("suivi-permis-data-v1");
    } catch (e) { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.wrap}>
          <div style={styles.card}>
            <h1 style={styles.title}>Un problème est survenu</h1>
            <p style={styles.text}>
              L'application a rencontré une erreur inattendue. Tes données ne sont pas perdues :
              essaie de recharger la page. Si le problème persiste, tu peux réinitialiser
              les données locales (à utiliser en dernier recours — pense à exporter une
              sauvegarde si possible avant).
            </p>
            <div style={styles.actions}>
              <button style={styles.primaryBtn} onClick={() => window.location.reload()}>
                Recharger la page
              </button>
              <button style={styles.dangerBtn} onClick={this.handleReset}>
                Réinitialiser les données locales
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#EEF0F2", fontFamily: "sans-serif", padding: 20 },
  card: { background: "#fff", border: "1px solid #DDE1E4", borderRadius: 12, padding: 28, maxWidth: 440 },
  title: { fontSize: 20, margin: "0 0 12px", color: "#23282D" },
  text: { fontSize: 14, color: "#5B6570", lineHeight: 1.5, margin: "0 0 20px" },
  actions: { display: "flex", gap: 10, flexWrap: "wrap" },
  primaryBtn: { background: "#1B4B7A", color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" },
  dangerBtn: { background: "transparent", color: "#C0272D", border: "1px solid #C0272D", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" },
};
