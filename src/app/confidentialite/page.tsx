import Link from 'next/link';
import { BackButton } from '@/components/BackButton';

export const metadata = {
  title: 'Confidentialité',
};

export default function ConfidentialitePage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 flex justify-center">
      <div className="w-full max-w-lg">
        <BackButton withSwipe className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6 text-sm" />

        <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Politique de confidentialité</h1>
        <p className="text-xs text-slate-400 mb-8">Dernière mise à jour : août 2026</p>

        <div className="flex flex-col gap-6 text-sm text-slate-600 leading-relaxed [&_h2]:text-slate-900 [&_h2]:font-bold [&_h2]:text-base [&_h2]:mb-2">
          <section>
            <h2>Ce que nous collectons</h2>
            <ul className="list-disc ml-5 flex flex-col gap-1">
              <li><strong>Ton email</strong> : uniquement pour te connecter (code de connexion envoyé par email). Il n&apos;est jamais affiché aux autres membres.</li>
              <li><strong>Un pseudo anonyme</strong> généré automatiquement (ex. « CosmicPanda42 ») : c&apos;est lui que voient les autres.</li>
              <li><strong>Ton profil optionnel</strong> (prénom, âge, sexe) : uniquement si tu le remplis.</li>
              <li><strong>Les spots que tu as rejoints</strong> en scannant leur QR code, tes messages et réactions dans leurs chats,
                tes réglages de notification par spot et la date de ta dernière lecture de chaque chat (pour le compteur de messages non lus).</li>
              <li><strong>Tes events</strong> créés ou rejoints.</li>
              <li><strong>Une adresse technique de notification</strong> si tu actives les notifications push.</li>
              <li><strong>Une mesure d&apos;audience interne</strong> : quand la page d&apos;un spot est ouverte via son QR code,
                nous comptons la visite avec un identifiant aléatoire stocké sur ton appareil. Cette mesure est hébergée
                chez nous, jamais partagée, et supprimée après 12 mois. S&apos;y ajoute la mesure de pages vues anonyme et
                <strong> sans cookie</strong> de notre hébergeur (Vercel Analytics). Aucun traceur publicitaire.</li>
            </ul>
          </section>

          <section>
            <h2>Ta position</h2>
            <p>
              La géolocalisation est <strong>optionnelle</strong> : tu l&apos;actives toi-même, et sans elle tout fonctionne
              (tu apparais simplement « Spectateur »). Quand elle est active, ta position GPS est traitée
              <strong> uniquement dans ton navigateur</strong> pour vérifier que tu es sur place (rayon de 100 m,
              vérification périodique tant que la page est ouverte). Tes coordonnées ne sont
              <strong> jamais envoyées ni stockées</strong> sur nos serveurs : seul un statut « sur place » (oui/non)
              accompagne tes messages et alimente les compteurs temps réel du spot (« X sur place », « X en ligne »),
              visibles par les personnes présentes sur la page. Ce statut disparaît dès que tu quittes la page.
            </p>
          </section>

          <section>
            <h2>Combien de temps</h2>
            <ul className="list-disc ml-5 flex flex-col gap-1">
              <li>Messages des chats : supprimés après <strong>30 jours</strong>.</li>
              <li>Events passés : supprimés <strong>30 jours</strong> après leur date.</li>
              <li>Comptes inactifs : supprimés après <strong>24 mois</strong> sans connexion.</li>
            </ul>
          </section>

          <section>
            <h2>Tes droits</h2>
            <p>
              Depuis ton <Link href="/profile" className="text-blue-600 font-medium">profil</Link>, tu peux à tout moment :
              modifier tes informations, <strong>télécharger toutes tes données</strong> (format JSON), ou
              <strong> supprimer définitivement ton compte</strong> : tout est effacé immédiatement (messages, réactions,
              adhésions, events, notifications), sans délai ni justification. Les mesures d&apos;audience internes sont
              dissociées de ton compte au moment de la suppression.
            </p>
          </section>

          <section>
            <h2>Ce que nous ne faisons pas</h2>
            <p>
              Pas de revente de données, pas de publicité ciblée, pas de traceurs tiers, pas de croisement avec d&apos;autres
              services. ATOUTE vit du lien entre un lieu et ses habitués, pas de tes données.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Pour toute question ou demande liée à tes données :{' '}
              <a href="mailto:virgilejoinville@gmail.com" className="text-blue-600 font-medium">virgilejoinville@gmail.com</a>
            </p>
          </section>
        </div>

        <div className="mt-12 mb-6 text-center text-xs text-slate-400">ATOUTE</div>
      </div>
    </div>
  );
}
